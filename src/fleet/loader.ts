// Loader — 캐릭터의 값을 인스턴스에 올리고 내린다 (design/02-roles/fleet.md 의 Loader).
// load 는 흐름 9 의 5 ~ 7, unload 는 흐름 10 의 5 ~ 7(흐름 11 의 3 · 7 의 3 도 이 길), save 는 흐름 5 의 2.
// 캐릭터의 값은 한때에 인스턴스 하나만 든다 — 그것을 지키는 것은 Leases(holder = `<인스턴스>@<세대>`)다. 값의 파일은 그 인스턴스의 건넴 자리(엔진의 --handoff)에 드나든다.
// 파일의 안을 보지 않는다 — 같은 값인가는 바이트의 해시로만 본다.

import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { KEEP_DONE, LOAD_DONE, UNLOAD_DONE } from '../protocol/engine';
import type { TraceEnd, TraceFn } from '../protocol/observe';
import type { CharacterStoreSocket, Lease, LeasesSocket } from '../protocol/storage';
import type { Console } from './console';
import { holderOf } from './instance';
import type { Runner } from './runner';

/** 로드된 캐릭터 하나 — 든 lease 와 마지막으로 저장한 값의 해시. */
interface Held {
  lease: Lease;
  hash: string | null;
}

const hashOf = (body: Buffer): string => createHash('sha256').update(body).digest('hex');

export class Loader {
  // 데이터 — leases · values(CharacterStore) · console(참조) · spool(Runner 의 서버마다의 건넴 자리) · loaded(인스턴스 → 캐릭터 → 든 것)
  // unsaved 는 내렸는데 저장하지 못한 것 — 파일과 lease 를 쥔 채 다음 save 가 다시 한다(흐름 11 의 「실패하면」)
  readonly leases: LeasesSocket;
  readonly values: CharacterStoreSocket;
  readonly console: Console;
  readonly loaded = new Map<string, Map<string, Held>>();
  readonly unsaved = new Map<string, Map<string, Held & { readonly file: string }>>();
  private readonly runner: Runner;
  private readonly trace: TraceFn;
  private readonly log: (line: string) => void;

  constructor(leases: LeasesSocket, values: CharacterStoreSocket, console: Console, runner: Runner, trace: TraceFn, log: (line: string) => void) {
    this.leases = leases;
    this.values = values;
    this.console = console;
    this.runner = runner;
    this.trace = trace;
    this.log = log;
  }

  private mark(flow: number, step: number, run: string, unit: string, end: TraceEnd, counts?: Record<string, number>): void {
    this.trace({ flow, step, run, unit, end, ...(counts === undefined ? {} : { counts }) });
  }

  /** 그 인스턴스에 로드된 캐릭터들. */
  of(instance: string): string[] {
    return [...(this.loaded.get(instance)?.keys() ?? [])];
  }

  private fileOf(instance: string, character: string): string | null {
    const server = this.runner.get(instance);
    return server === null ? null : join(server.handoffDir, `${character}.json`);
  }

  /**
   * load — 흐름 9 의 5 ~ 7. lease 를 받고, 값을 캐릭터 파일에 내려 받아, 호스트에 로드시킨다(파일이 없으면 엔진이 틀에서 낳는다). spot 은 설 공간.
   * 되면 null, 아니면 까닭 — 실패하면 받은 lease 를 푼다. 이미 그 인스턴스에 로드돼 있으면 그대로 null.
   * 내렸는데 저장하지 못한 것(unsaved)이 그 인스턴스에 있으면 그 파일과 lease 로 다시 올린다(흐름 10 의 「실패하면」 — 지금의 인스턴스에 다시 올린다).
   */
  async load(instance: string, character: string, spot: string | null, run: string): Promise<string | null> {
    const server = this.runner.get(instance);
    if (server === null || server.state !== 'ready') return `인스턴스가 떠 있지 않다 — ${instance}`;
    const mine = this.loaded.get(instance) ?? new Map<string, Held>();
    this.loaded.set(instance, mine);
    if (mine.has(character)) return null;
    const file = join(server.handoffDir, `${character}.json`);
    const kept = this.unsaved.get(instance)?.get(character);
    let held: Held;
    if (kept !== undefined) {
      this.unsaved.get(instance)!.delete(character);
      held = { lease: kept.lease, hash: null };
      this.mark(9, 5, run, instance, 'ok'); // 쥐고 있던 lease
      this.mark(9, 6, run, instance, 'ok', { found: 1 }); // 쥐고 있던 파일
    } else {
      let lease: Lease | null;
      try {
        lease = await this.leases.acquire(character, holderOf({ name: instance, epoch: server.epoch }));
      } catch (e) {
        this.mark(9, 5, run, instance, 'failed');
        return `스토리지에 닿지 않는다 — ${(e as Error).message}`;
      }
      this.mark(9, 5, run, instance, lease === null ? 'refused' : 'ok'); // Leases.acquire
      if (lease === null) return '값을 다른 인스턴스가 들고 있다 — 잠시 뒤 다시 입장';
      held = { lease, hash: null };
      try {
        await rm(file, { force: true }); // 지난 파일이 남아 있으면 엔진이 그것으로 세운다 — 값이 없으면 틀에서 낳게 지운다
        const found = await this.values.read(character, file);
        if (found) held.hash = hashOf(await readFile(file));
        this.mark(9, 6, run, instance, 'ok', { found: found ? 1 : 0 }); // CharacterStore.read
      } catch (e) {
        this.mark(9, 6, run, instance, 'failed');
        await this.leases.release(lease).catch(() => {});
        return `값을 내려 받지 못했다 — ${(e as Error).message}`;
      }
    }
    const answer = await this.console.command(instance, spot === null ? `load ${character}` : `load ${character} ${spot}`);
    const done = answer !== null && LOAD_DONE.test(answer);
    this.mark(9, 7, run, instance, done ? 'ok' : answer === null ? 'failed' : 'refused'); // Console.command — load
    if (!done) {
      await this.leases.release(held.lease).catch(() => {});
      return `호스트가 로드하지 않았다 — ${answer ?? '답 없음'}`;
    }
    mine.set(character, held);
    return null;
  }

  /**
   * unload — 흐름 10 의 5 ~ 7. 호스트에 언로드시켜(그 캐릭터의 선은 1001 로 닫힌다) 캐릭터 파일을 받아 저장하고 lease 를 푼다. 되면 null, 아니면 까닭.
   * 로드돼 있지 않으면 null. 호스트가 답하지 않으면 lease 를 푼다(값은 마지막으로 저장한 것). 저장이 닿지 않으면 파일과 lease 를 쥔 채 다음 save 가 다시 한다.
   */
  async unload(instance: string, character: string, run: string): Promise<string | null> {
    const mine = this.loaded.get(instance);
    const held = mine?.get(character);
    if (mine === undefined || held === undefined) return null;
    mine.delete(character);
    const answer = await this.console.command(instance, `unload ${character}`);
    const m = answer === null ? null : UNLOAD_DONE.exec(answer);
    this.mark(10, 5, run, instance, m !== null ? 'ok' : answer === null ? 'failed' : 'refused'); // Console.command — unload
    if (m === null) {
      await this.leases.release(held.lease).catch(() => {});
      this.mark(10, 7, run, instance, 'ok');
      return `호스트가 언로드하지 않았다 — ${answer ?? '답 없음'} (값은 마지막으로 저장한 것)`;
    }
    const file = this.fileOf(instance, character) ?? m[2]!;
    let wrote: boolean;
    try {
      wrote = await this.values.write(character, held.lease, file);
    } catch (e) {
      this.mark(10, 6, run, instance, 'failed'); // 스토리지에 닿지 않는다 — 쥔 채 다시
      const kept = this.unsaved.get(instance) ?? new Map();
      kept.set(character, { ...held, file });
      this.unsaved.set(instance, kept);
      this.log(`${character} fleet 값을 저장하지 못했다 — ${(e as Error).message} (${instance} 이 파일을 쥔 채 다시 한다)`);
      return `값을 저장하지 못했다 — ${(e as Error).message}`;
    }
    this.mark(10, 6, run, instance, wrote ? 'ok' : 'refused'); // CharacterStore.write — 거절이면 lease 를 잃었다(값은 더 새 것이 있다)
    await this.leases.release(held.lease).catch(() => {});
    this.mark(10, 7, run, instance, 'ok'); // Leases.release
    await rm(file, { force: true });
    return wrote ? null : 'lease 를 잃었다 — 값은 다른 곳의 것이 더 새것이다';
  }

  /**
   * save — 흐름 5 의 2. 로드된 캐릭터 전부의 값을 한 번에 쓰게 하고(`keep`), lease 를 늦추고, 바뀐 값만 저장한다.
   * lease 를 잃은 캐릭터는 호스트에서 언로드시키고 값은 버린다. 내렸는데 저장하지 못한 것을 다시 한다.
   */
  async save(instance: string, run: string): Promise<void> {
    const mine = this.loaded.get(instance);
    const kept = this.unsaved.get(instance);
    if ((mine === undefined || mine.size === 0) && (kept === undefined || kept.size === 0)) return;
    let saved = 0;
    let lost = 0;
    let failed = 0;
    for (const [character, h] of [...(kept ?? new Map<string, Held & { file: string }>())]) {
      try {
        const wrote = await this.values.write(character, h.lease, h.file);
        kept!.delete(character);
        await this.leases.release(h.lease).catch(() => {});
        await rm(h.file, { force: true });
        if (wrote) saved++;
        else lost++;
      } catch {
        failed++; // 다음 주기에 다시
      }
    }
    if (mine !== undefined && mine.size > 0) {
      const answer = await this.console.command(instance, 'keep');
      if (answer === null || !KEEP_DONE.test(answer)) {
        this.mark(5, 2, run, instance, 'failed', { loaded: mine.size });
        return;
      }
      for (const [character, h] of [...mine]) {
        const file = this.fileOf(instance, character);
        if (file === null) break;
        try {
          const renewed = await this.leases.renew(h.lease);
          let wrote = renewed !== null;
          if (renewed !== null) {
            h.lease = renewed;
            const hash = hashOf(await readFile(file));
            if (hash !== h.hash) {
              wrote = await this.values.write(character, renewed, file);
              if (wrote) {
                h.hash = hash;
                saved++;
              }
            }
          }
          if (!wrote) {
            // lease 를 잃었다 — 다른 곳에 배정됐다. 이 묶음을 세계에서 지운다(값은 버린다)
            lost++;
            mine.delete(character);
            await this.console.command(instance, `unload ${character}`);
            await rm(file, { force: true });
            this.log(`${character} fleet lease 를 잃었다 — ${instance} 에서 내렸다(값은 버린다)`);
          }
        } catch {
          failed++; // 스토리지에 닿지 않는다 — 다음 주기에 다시
        }
      }
    }
    this.mark(5, 2, run, instance, failed > 0 ? 'failed' : 'ok', { loaded: mine?.size ?? 0, saved, lost }); // Loader.save
  }

  /** forget — 호스트가 죽었다. 그 인스턴스의 것을 놓는다 — lease 는 Recoverer 가 끊는다(흐름 12 의 3). */
  forget(instance: string): void {
    this.loaded.delete(instance);
    this.unsaved.delete(instance);
  }
}
