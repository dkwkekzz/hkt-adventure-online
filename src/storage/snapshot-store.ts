// SnapshotStore — 인스턴스의 Store 디렉터리와 그 백업을 둔다 (design/02-roles/storage.md 의 SnapshotStore).
// 안을 읽지 않는다 — 디렉터리를 통째로 묶어(pack.ts) 물건 하나로 올리고 내린다. remote 는 물건의 뒤(bucket.ts — object storage 또는 디렉터리).
//
//   local   <root>/local/<인스턴스>/            Store 자리 — 엔진이 쓴다(--store)
//           <root>/local/<인스턴스>.rev         그 자리가 어느 판에서 났는가(비면 올라간 것이 없을 때 난 것)
//   remote  <인스턴스>/current.tgz              지금 것 — meta 의 epoch(세대) · rev(판)
//           <인스턴스>/backups/<UTC 시각>.tgz    백업 — 이름 순 = 시간 순

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { SnapshotStoreSocket } from '../protocol/storage';
import type { Bucket, Head } from './bucket';
import { missing } from './docs';
import { pack, unpack } from './pack';

/** 백업 이름 — UTC 시각 `YYYYMMDDTHHMMSSmmmZ`. 이름 순 = 시간 순. */
export const stamp = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace('.', '');

const checkInstance = (instance: string): string => {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(instance)) throw new Error(`인스턴스의 이름이 자리가 될 수 없다 — ${instance}`);
  return instance;
};
const checkBackup = (backup: string): string => {
  if (!/^[0-9]{8}T[0-9]{9}Z(?:-[0-9]+)?$/.test(backup)) throw new Error(`백업이 없다 — ${backup}`);
  return backup;
};
const epochOf = (h: Head | null): number => Number(h?.meta['epoch'] ?? 0) || 0;
const freshRev = (): string => randomBytes(8).toString('hex');

export class SnapshotStore implements SnapshotStoreSocket {
  // 데이터 — local(이 서버의 뿌리) · remote(물건의 뒤)
  readonly local: string;
  readonly remote: Bucket;
  private readonly now: () => Date;

  constructor(root: string, remote: Bucket, now: () => Date = () => new Date()) {
    this.local = join(resolve(root), 'local');
    this.remote = remote;
    this.now = now;
  }

  /** 이 서버의 Store 자리 — 만들지 않는다. */
  dirOf(instance: string): string {
    return join(this.local, checkInstance(instance));
  }
  private revFile(instance: string): string {
    return join(this.local, `${checkInstance(instance)}.rev`);
  }
  private current(instance: string): string {
    return `${checkInstance(instance)}/current.tgz`;
  }
  private backupKey(instance: string, backup: string): string {
    return `${checkInstance(instance)}/backups/${checkBackup(backup)}.tgz`;
  }

  private async exists(p: string): Promise<boolean> {
    try {
      await stat(p);
      return true;
    } catch (e) {
      if (missing(e)) return false;
      throw e;
    }
  }

  private async readRev(instance: string): Promise<string> {
    try {
      return (await readFile(this.revFile(instance), 'utf8')).trim();
    } catch (e) {
      if (missing(e)) return '';
      throw e;
    }
  }

  async pull(instance: string): Promise<string> {
    const dir = this.dirOf(instance);
    const head = await this.remote.head(this.current(instance));
    const rev = head?.meta['rev'] ?? '';
    if ((await this.exists(dir)) && (await this.readRev(instance)) === rev) return dir; // 이 서버의 자리가 그 판에서 났다 — 올리지 못한 진행이 남는다
    const body = head === null ? null : await this.remote.get(this.current(instance));
    const tmp = `${dir}.pull`;
    await rm(tmp, { recursive: true, force: true });
    if (body === null) await mkdir(tmp, { recursive: true });
    else await unpack(body, tmp);
    await rm(dir, { recursive: true, force: true });
    await rename(tmp, dir);
    await writeFile(this.revFile(instance), body === null ? '' : rev);
    return dir;
  }

  async push(dir: string, instance: string, epoch: number): Promise<boolean> {
    const body = await pack(dir);
    for (let i = 0; i < 5; i++) {
      const head = await this.remote.head(this.current(instance));
      if (epochOf(head) > epoch) return false; // 낡은 세대 — 다른 곳에서 새로 띄웠다
      const rev = freshRev();
      if (await this.remote.put(this.current(instance), body, { epoch: String(epoch), rev }, head?.etag ?? null)) {
        if (resolve(dir) === this.dirOf(instance)) await writeFile(this.revFile(instance), rev);
        return true;
      }
    }
    throw new Error(`올리는 가운데 다른 올림이 끼었다 — ${instance}`);
  }

  async copy(instance: string): Promise<string> {
    const head = await this.remote.head(this.current(instance));
    if (head === null) throw new Error(`올라간 것이 없다 — ${instance}`);
    const base = stamp(this.now());
    let name = base;
    for (let i = 1; (await this.remote.head(this.backupKey(instance, name))) !== null; i++) name = `${base}-${i}`; // 같은 ms 에 둘
    await this.remote.copy(this.current(instance), this.backupKey(instance, name), head.meta);
    return name;
  }

  async restore(instance: string, backup: string): Promise<void> {
    const key = this.backupKey(instance, backup);
    const from = await this.remote.head(key);
    if (from === null) throw new Error(`백업이 없다 — ${backup}`);
    const cur = await this.remote.head(this.current(instance));
    if (cur !== null) await this.copy(instance); // 기존은 백업 하나로 남긴다
    // 새 판 — 이 서버의 자리도 다음 pull 이 다시 내려 받는다. 세대는 줄지 않는다
    await this.remote.copy(key, this.current(instance), { epoch: String(Math.max(epochOf(cur), epochOf(from))), rev: freshRev() });
  }

  async list(instance: string): Promise<string[]> {
    const head = `${checkInstance(instance)}/backups/`;
    return (await this.remote.list(head)).map((k) => k.slice(head.length).replace(/\.tgz$/, '')).sort();
  }

  async prune(instance: string, keep: number): Promise<void> {
    const all = await this.list(instance);
    for (const name of all.slice(0, Math.max(0, all.length - keep))) await this.remote.remove(this.backupKey(instance, name));
  }

  async purge(instance: string): Promise<void> {
    for (const key of await this.remote.list(`${checkInstance(instance)}/`)) await this.remote.remove(key);
    await rm(this.dirOf(instance), { recursive: true, force: true });
    await rm(this.revFile(instance), { force: true });
  }
}
