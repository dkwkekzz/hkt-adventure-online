// Backuper — 인스턴스의 Store 를 백업해 올린다 (design/02-roles/node.md 의 Backuper, 흐름 5 의 3 · 7 의 5).
// 도는 호스트의 Store 자리를 그대로 올리지 않는다 — 엔진이 `backup <dir>` 으로 낸 사본(한 저장의 것)을 올린다(흐름 5 의 규칙).

import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { TraceFn } from '../protocol/observe';
import type { SnapshotStoreSocket } from '../protocol/storage';
import type { Console } from './console';
import type { Runner } from './runner';

export class Backuper {
  // 데이터 — snapshots(참조) · console(참조) · keep(남기는 백업의 수 — 설정)
  readonly snapshots: SnapshotStoreSocket;
  readonly console: Console;
  readonly keep: number;
  private readonly runner: Runner;
  private readonly limitMs: number;
  private readonly trace: TraceFn;
  private readonly log: (line: string) => void;

  constructor(snapshots: SnapshotStoreSocket, console: Console, runner: Runner, keep: number, limitMs: number, trace: TraceFn, log: (line: string) => void) {
    this.snapshots = snapshots;
    this.console = console;
    this.runner = runner;
    this.keep = keep;
    this.limitMs = limitMs;
    this.trace = trace;
    this.log = log;
  }

  /** 올리고 백업 하나를 남긴다 — 낡은 세대면 false. 새것 keep 개만 남긴다. */
  private async put(dir: string, instance: string, epoch: number): Promise<string | null> {
    if (!(await this.snapshots.push(dir, instance, epoch))) return null;
    const made = await this.snapshots.copy(instance);
    await this.snapshots.prune(instance, this.keep);
    return made;
  }

  /** backup — 흐름 5 의 3. 도는 호스트에 `backup <dir>` 을 시켜 그 사본을 올리고 백업 하나를 남긴다. 그 백업의 이름, 못 하면 null(다음 주기에 다시). */
  async backup(instance: string, epoch: number, run: string): Promise<string | null> {
    const server = this.runner.get(instance);
    if (server === null || server.state !== 'ready') return null;
    const dir = join(this.runner.spool, '.backup', `${instance}-${epoch}-${Date.now()}`);
    const waited = this.runner.backed(instance, dir, this.limitMs);
    const answer = await this.console.command(instance, `backup ${dir}`);
    try {
      if (answer === null || !answer.startsWith('backup — ')) throw new Error(`호스트가 베끼지 않는다 — ${answer ?? '답 없음'}`);
      const done = await waited;
      if (done.error !== null) throw new Error(done.error);
      const made = await this.put(dir, instance, epoch);
      this.trace({ flow: 5, step: 3, run, unit: instance, end: made === null ? 'refused' : 'ok', ...(done.now === null ? {} : { counts: { now: done.now } }) }); // Backuper.backup
      if (made !== null) this.log(`${instance} fleet 백업했다 — ${made} · now ${done.now}`);
      return made;
    } catch (e) {
      this.trace({ flow: 5, step: 3, run, unit: instance, end: 'failed' });
      this.log(`${instance} fleet 백업하지 못했다 — ${(e as Error).message}`);
      return null;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** upload — 흐름 7 의 5. 내려간 인스턴스의 Store 자리를 올리고 백업 하나를 남긴다. 못 올리면 그 자리가 이 서버에 남는다 — 다음 pull 이 그대로 준다. */
  async upload(instance: string, dir: string, epoch: number, run: string): Promise<boolean> {
    try {
      const made = await this.put(dir, instance, epoch);
      this.trace({ flow: 7, step: 5, run, unit: instance, end: made === null ? 'refused' : 'ok', counts: { epoch } }); // Backuper.upload
      this.log(`${instance} fleet Store 를 ${made === null ? '올리지 않았다 — 더 새 세대가 올라가 있다' : `올렸다 — 백업 ${made}`} · 세대 ${epoch}`);
      return made !== null;
    } catch (e) {
      this.trace({ flow: 7, step: 5, run, unit: instance, end: 'failed', counts: { epoch } });
      this.log(`${instance} fleet Store 를 올리지 못했다 — ${(e as Error).message} (이 서버의 자리에 남는다)`);
      return false;
    }
  }
}
