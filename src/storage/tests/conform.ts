// 뒤마다 같은 검사 — Database · Leases · CharacterStore · LeaderLock · SnapshotStore 를 openStorage 가 낸 소켓으로만 본다.
// 디렉터리의 뒤(storage.spec.ts)는 늘 돌고, MongoDB 의 뒤(mongo.spec.ts)는 MONGODB_URI 가 있을 때, object storage(s3.spec.ts)는 가짜 S3 · SNAPSHOT_URI 위에서.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { SnapshotStoreSocket, StorageSocket } from '../../protocol/storage';

export const scratch = (name: string): string => mkdtempSync(join(tmpdir(), `${name}-`));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 문서의 뒤를 쓰는 개념 넷. open 은 같은 뒤를 다시 여는 것(다른 서버에서 띄운 것과 같다). leaseMs 는 짧게 연 것. */
export function conformDocs(label: string, open: () => Promise<StorageSocket>, leaseMs: number): void {
  const opened: StorageSocket[] = [];
  const up = async () => {
    const s = await open();
    opened.push(s);
    return s;
  };
  afterAll(async () => {
    await Promise.all(opened.map((s) => s.close()));
  });
  const id = (): string => `x${Math.random().toString(36).slice(2, 10)}`;

  describe(`${label} — Database.get · put · remove · all`, () => {
    it('줄 하나를 통째로 쓰고 읽는다. 없으면 null. 다시 열어도 같다', async () => {
      const s = await up();
      const key = `guest:${id()}`;
      expect(await s.database.get('accounts', key)).toBeNull();
      await s.database.put('accounts', key, 'p1');
      await s.database.put('instances', key, { dataset: 'd.json', port: 3100, epoch: 2 });
      expect(await s.database.get('accounts', key)).toBe('p1');
      const again = await up();
      expect(await again.database.get('instances', key)).toEqual({ dataset: 'd.json', port: 3100, epoch: 2 });
      expect((await again.database.all('instances')).find(([k]) => k === key)).toEqual([key, { dataset: 'd.json', port: 3100, epoch: 2 }]);
      await again.database.remove('accounts', key);
      expect(await s.database.get('accounts', key)).toBeNull();
      await expect(s.database.get('nope' as 'accounts', key)).rejects.toThrow(/표가 아니다/);
    });

    it('같은 줄에 동시에 쓰면 하나가 이긴다 — 반쯤 쓴 줄이 없다', async () => {
      const s = await up();
      const key = id();
      await Promise.all(Array.from({ length: 20 }, (_, i) => s.database.put('audit', key, { i, pad: 'x'.repeat(2000) })));
      const got = (await s.database.get('audit', key)) as { i: number; pad: string };
      expect(got.pad).toHaveLength(2000);
      expect(got.i).toBeGreaterThanOrEqual(0);
    });
  });

  describe(`${label} — Leases.acquire · renew · release · expire`, () => {
    it('하나만 잡는다. 비우면 번호가 오르고, 만료되면 남이 잡는다', async () => {
      const s = await up();
      const c = id();
      const a = await s.leases.acquire(c, 'main-1@1');
      expect(a).toMatchObject({ character: c, holder: 'main-1@1', n: 1 });
      expect(await s.leases.acquire(c, 'main-2@1')).toBeNull();
      const renewed = await s.leases.renew(a!);
      expect(renewed!.until).toBeGreaterThanOrEqual(a!.until);
      await s.leases.release(a!);
      expect(await s.leases.renew(a!)).toBeNull(); // 비운 뒤의 늦춤은 안 된다
      const b = await s.leases.acquire(c, 'main-2@1');
      expect(b!.n).toBe(3); // 잡음 1 · 비움 2 · 잡음 3
      await sleep(leaseMs + 30);
      const late = await s.leases.acquire(c, 'main-3@1');
      expect(late).toMatchObject({ holder: 'main-3@1', n: 4 });
      expect(await s.leases.renew(b!)).toBeNull();
    });

    it('동시에 잡으면 하나만 된다. expire 는 그 holder 의 것을 전부 비운다', async () => {
      const s = await up();
      const c = id();
      const got = await Promise.all(Array.from({ length: 8 }, (_, i) => s.leases.acquire(c, `h${i}@1`)));
      expect(got.filter((l) => l !== null)).toHaveLength(1);
      const holder = `dead-${id()}@1`;
      const [x, y] = [id(), id()];
      await s.leases.acquire(x, holder);
      await s.leases.acquire(y, holder);
      await s.leases.expire(holder);
      expect(await s.leases.acquire(x, 'next@1')).toMatchObject({ n: 3 });
      expect(await s.leases.acquire(y, 'next@1')).toMatchObject({ n: 3 });
    });
  });

  describe(`${label} — CharacterStore.read · write · erase · versions · rollback`, () => {
    it('지금의 lease 로만 쓴다. 앞의 lease 의 뒤늦은 쓰기는 거절. 이력으로 되돌린다', async () => {
      const s = await up();
      const c = id();
      const dir = scratch('chars');
      const file = join(dir, 'in.json');
      const out = join(dir, 'out', `${c}.json`);
      expect(await s.characters.read(c, out)).toBe(false);
      expect(existsSync(out)).toBe(false); // 없으면 만들지 않는다
      const first = (await s.leases.acquire(c, 'i1@1'))!;
      writeFileSync(file, '{"hp":1}');
      expect(await s.characters.write(c, first, file)).toBe(true);
      writeFileSync(file, '{"hp":2}');
      expect(await s.characters.write(c, first, file)).toBe(true);
      expect(await s.characters.erase(c)).toBe(false); // 들고 있다
      await s.leases.release(first);
      const second = (await s.leases.acquire(c, 'i2@1'))!;
      writeFileSync(file, '{"hp":3}');
      expect(await s.characters.write(c, first, file)).toBe(false); // 앞의 lease
      expect(await s.characters.write(c, second, file)).toBe(true);
      expect(await s.characters.read(c, out)).toBe(true);
      expect(readFileSync(out, 'utf8')).toBe('{"hp":3}');
      const versions = await s.characters.versions(c);
      expect(versions).toHaveLength(2);
      expect(await s.characters.rollback(c, versions[0]!)).toBe(false); // 들고 있다
      await s.leases.release(second);
      expect(await s.characters.rollback(c, versions[0]!)).toBe(true);
      await s.characters.read(c, out);
      expect(readFileSync(out, 'utf8')).toBe('{"hp":1}');
      expect(await s.characters.rollback(c, 1)).toBe(false); // 없는 때
      expect(await s.characters.erase(c)).toBe(true);
      expect(await s.characters.read(c, out)).toBe(false); // 지웠다
      expect(await s.characters.versions(c)).toEqual([]);
    });
  });

  describe(`${label} — LeaderLock.acquire · renew · resign · holder`, () => {
    it('하나만 잡는다. term 은 늘기만 한다. 만료되면 남이 잡는다', async () => {
      const s = await up();
      const before = await s.leader.holder();
      const base = before?.term ?? 0;
      if (before !== null) await s.leader.resign(before.holder, before.term);
      const t1 = await s.leader.acquire('10.0.0.1:9000', leaseMs);
      expect(t1).toBeGreaterThan(base);
      expect(await s.leader.acquire('10.0.0.2:9000', leaseMs)).toBeNull();
      expect(await s.leader.holder()).toEqual({ holder: '10.0.0.1:9000', term: t1 });
      expect(await s.leader.renew('10.0.0.1:9000', t1!)).toBe(true);
      expect(await s.leader.renew('10.0.0.2:9000', t1!)).toBe(false);
      await s.leader.resign('10.0.0.1:9000', t1!);
      expect(await s.leader.holder()).toBeNull();
      const t2 = await s.leader.acquire('10.0.0.2:9000', leaseMs);
      expect(t2).toBe(t1! + 1);
      await sleep(leaseMs + 30);
      expect(await s.leader.renew('10.0.0.2:9000', t2!)).toBe(false); // 만료된 자리는 늦추지 않는다
      expect(await s.leader.acquire('10.0.0.3:9000', leaseMs)).toBe(t2! + 1);
      await s.leader.resign('10.0.0.3:9000', t2! + 1);
    });
  });
}

/** 물건의 뒤를 쓰는 SnapshotStore. open(root) 은 그 서버의 local 뿌리로 연 것 — remote 는 같다(서버 둘이 같은 object storage 를 쓴다). */
export function conformSnapshots(label: string, open: (root: string) => SnapshotStoreSocket): void {
  const up = async (root: string) => ({ snapshots: open(root) });
  const name = (): string => `w${Math.random().toString(36).slice(2, 10)}`;

  describe(`${label} — SnapshotStore.pull · push · copy · restore · list · prune · purge`, () => {
    it('없으면 빈 자리. 올린 것을 다른 서버가 내려 받는다. 낡은 세대는 거절', async () => {
      const a = await up(scratch('node-a'));
      const b = await up(scratch('node-b'));
      const w = name();
      const dir = await a.snapshots.pull(w);
      expect(readdirSync(dir)).toEqual([]);
      writeFileSync(join(dir, 'snapshot.json'), '{"now":1}');
      mkdirSync(join(dir, 'regions'));
      writeFileSync(join(dir, 'regions', 'r1.json'), '{"r":1}');
      expect(await a.snapshots.push(dir, w, 1)).toBe(true);
      const there = await b.snapshots.pull(w);
      expect(there).not.toBe(dir);
      expect(readFileSync(join(there, 'regions', 'r1.json'), 'utf8')).toBe('{"r":1}');
      writeFileSync(join(there, 'snapshot.json'), '{"now":2}');
      expect(await b.snapshots.push(there, w, 2)).toBe(true);
      expect(await a.snapshots.push(dir, w, 1)).toBe(false); // 낡은 세대
      expect(readFileSync(join(await a.snapshots.pull(w), 'snapshot.json'), 'utf8')).toBe('{"now":2}'); // 새 판을 내려 받는다
    });

    it('이 서버의 자리가 올라간 판에서 났으면 그대로 — 올리지 못한 진행이 남는다', async () => {
      const a = await up(scratch('node-a'));
      const w = name();
      const dir = await a.snapshots.pull(w);
      writeFileSync(join(dir, 'snapshot.json'), '{"now":1}');
      await a.snapshots.push(dir, w, 1);
      writeFileSync(join(dir, 'snapshot.json'), '{"now":5}'); // 호스트가 죽었다 — 올리지 못했다
      expect(readFileSync(join(await a.snapshots.pull(w), 'snapshot.json'), 'utf8')).toBe('{"now":5}');
    });

    it('copy · list · restore · prune · purge — 되돌리면 기존은 백업 하나로 남고 다음 pull 이 내려 받는다', async () => {
      const a = await up(scratch('node-a'));
      const w = name();
      await expect(a.snapshots.copy(w)).rejects.toThrow(/올라간 것이 없다/);
      const dir = await a.snapshots.pull(w);
      writeFileSync(join(dir, 'snapshot.json'), '{"now":1}');
      await a.snapshots.push(dir, w, 1);
      const first = await a.snapshots.copy(w);
      expect(first).toMatch(/^\d{8}T\d{9}Z(-\d+)?$/);
      writeFileSync(join(dir, 'snapshot.json'), '{"now":2}');
      await a.snapshots.push(dir, w, 1);
      expect(await a.snapshots.list(w)).toEqual([first]);
      await a.snapshots.restore(w, first);
      expect(readFileSync(join(await a.snapshots.pull(w), 'snapshot.json'), 'utf8')).toBe('{"now":1}');
      const all = await a.snapshots.list(w);
      expect(all).toHaveLength(2); // 첫 백업 + 되돌리기 전의 것
      expect(all[0]).toBe(first);
      await expect(a.snapshots.restore(w, 'nope')).rejects.toThrow(/백업이 없다/);
      await expect(a.snapshots.restore(w, '../x')).rejects.toThrow(/백업이 없다/);
      await expect(a.snapshots.pull('../up')).rejects.toThrow(/자리가 될 수 없다/);
      await a.snapshots.prune(w, 1);
      expect(await a.snapshots.list(w)).toEqual([all[1]]);
      expect(await a.snapshots.push(dir, w, 1)).toBe(true); // 되돌린 뒤에도 같은 세대로 올린다
      await a.snapshots.purge(w);
      expect(await a.snapshots.list(w)).toEqual([]);
      expect(readdirSync(await a.snapshots.pull(w))).toEqual([]);
    });
  });
}
