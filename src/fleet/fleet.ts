// Fleet — 세계 하나와 그 프로세스 (design/02-roles/fleet.md 의 Fleet). launch 는 흐름 3 의 B, tick 은 흐름 5, stopAll 은 흐름 7 의 2.
// 사람은 모두 같은 세계에 붙는다 — 캐릭터마다 사람의 묶음 하나는 엔진이 세운다(--party). 누구를 어디에 배정하는가는 세션 모듈이 정한다 —
// 플릿은 ready(그 존의 ready 인 인스턴스) · launch(띄운다) · address(호스트의 내부 주소)를 앱을 거쳐 세션 모듈에 준다.
// 지금은 존 하나 = 세계 하나 = 인스턴스 하나(이름이 config.world). 한 존에 인스턴스 여럿은 plan 07.
// 스토리지에는 Storage 소켓(Database · SnapshotStore)으로만, 토큰은 앱이 준 issue 로만 닿는다. 게임 명사를 모른다 — 데이터셋 · 틀 · NPC 묶음은 설정 값.

import type { TraceFn } from '../protocol/observe';
import type { StorageSocket } from '../protocol/storage';
import { Assignment } from './assignment';
import { Clock } from './clock';
import { Operator } from './operator';
import { Ports } from './ports';
import { Shard, freshRun } from './shard';
import type { ShardContext } from './shard';
import { Spawner } from './spawner';

export interface FleetConfig {
  readonly engineDir: string;
  /** 세계의 이름 — Store 자리 · 기록 · 운영자의 글이 이것으로 부른다. */
  readonly world: string;
  readonly dataset: string;
  /** 사람의 묶음의 틀 — 엔진의 --party(body 이름). */
  readonly party: string;
  /** 뷰어의 묶음이 놓일 자리(viewer.js) — Fleet.start 가 한 번 묶는다. Static 이 준다. */
  readonly viewerOut: string;
  readonly beat: number;
  readonly sparse: number;
  readonly npc: { readonly account: string; readonly bodies: readonly string[] };
  readonly ports: readonly [number, number];
  /** 게이트웨이에서 호스트가 보이는 이름 — 내부망(Node.host) */
  readonly hostName: string;
  readonly clockMs: number;
  /** 사람의 접속 없이 이만큼 박자가 지나면 세계를 내린다. */
  readonly idleLimit: number;
  readonly startLimitMs: number;
  readonly stopLimitMs: number;
  readonly commandLimitMs: number;
  readonly restartLimit: number;
  /** 이만큼 박자마다 내려간 세계의 올라간 Store 를 백업한다. 0 이면 하지 않는다. */
  readonly backupEvery: number;
}

/** Fleet 이 닿는 스토리지 — 표(Database)와 Store(SnapshotStore). */
export type FleetStorage = Pick<StorageSocket, 'database' | 'snapshots'>;

export class Fleet {
  // 데이터 — fleet.md 의 Fleet 줄 그대로
  readonly shards = new Map<string, Shard>(); // 세계의 이름 → Shard. 지금은 하나(config.world)
  readonly assignment: Assignment;
  readonly ports: Ports;
  readonly clock: Clock;
  readonly operator: Operator;
  readonly storage: FleetStorage;
  readonly config: FleetConfig;
  ticks = 0;
  /** 뜨는 가운데의 launch — 한꺼번에 온 것은 이것을 기다린다 */
  private launching: Promise<boolean> | null = null;
  private readonly ctx: ShardContext;
  private readonly log: (line: string) => void;
  /** 흔적을 남긴다 — 앱이 준 Monitor.trace(흐름 14). Shard · Operator 도 이것으로. */
  readonly trace: TraceFn;

  /**
   * 흐름 1 의 1 · 7 — 엔진 체크아웃이 없으면 시작 거부(Spawner.missing), 표 `instances` 의 줄마다 Shard 를 stopped 로. 프로세스는 띄우지 않는다.
   * trace 는 앱이 준 Monitor.trace, run 은 흐름 1 의 것.
   */
  static async open(
    config: FleetConfig,
    storage: FleetStorage,
    key: string,
    issue: (account: string) => string,
    log: (line: string) => void = (l) => console.log(l),
    trace: TraceFn = () => {},
    run: string = freshRun(),
  ): Promise<Fleet> {
    const missing = Spawner.missing(config.engineDir);
    trace({ flow: 1, step: 7, run, unit: '-', end: missing === null ? 'ok' : 'refused' });
    if (missing !== null) throw new Error(missing);
    const fleet = new Fleet(config, storage, await Assignment.load(storage.database), key, issue, log, trace);
    const lost: string[] = [];
    for (const [name, row] of fleet.assignment.all()) {
      if (row.port !== null && !fleet.ports.mark(row.port)) {
        row.port = null; // 범위 밖 — 다음 입장이 새로 받는다(흐름 1 규칙)
        lost.push(name);
      }
      fleet.shards.set(name, new Shard(name, row, fleet.ctx));
      trace({ flow: 1, step: 1, run, unit: name, end: 'ok', state: 'stopped', counts: { players: 0 } }); // 표의 줄마다 stopped 로 선다
    }
    for (const name of lost) await fleet.assignment.put(name, fleet.assignment.get(name)!);
    return fleet;
  }

  private constructor(
    config: FleetConfig,
    storage: FleetStorage,
    assignment: Assignment,
    key: string,
    issue: (account: string) => string,
    log: (line: string) => void,
    trace: TraceFn,
  ) {
    this.trace = trace;
    this.config = config;
    this.storage = storage;
    this.assignment = assignment;
    this.ports = new Ports(config.ports);
    this.clock = new Clock(config.clockMs);
    this.operator = new Operator(this);
    this.log = log;
    this.ctx = {
      engineDir: config.engineDir,
      beat: config.beat,
      sparse: config.sparse,
      npc: config.npc,
      party: config.party,
      startLimitMs: config.startLimitMs,
      stopLimitMs: config.stopLimitMs,
      commandLimitMs: config.commandLimitMs,
      restartLimit: config.restartLimit,
      key,
      issue,
      log,
      trace,
      put: (name, row) => this.assignment.put(name, row),
      pull: (name, run) => this.pull(name, run),
      push: (name, dir, epoch, run) => this.push(name, dir, epoch, run),
    };
  }

  /** 흐름 3 의 13 — 그 세계의 Store 를 이 서버에(SnapshotStore.pull). */
  private async pull(name: string, run: string): Promise<string> {
    try {
      const dir = await this.storage.snapshots.pull(name);
      this.trace({ flow: 3, step: 13, run, unit: name, end: 'ok' });
      return dir;
    } catch (e) {
      this.trace({ flow: 3, step: 13, run, unit: name, end: 'failed' });
      throw e;
    }
  }

  /** 흐름 7 의 5(Backuper.upload 의 일) — 내려간 Store 자리를 올린다(SnapshotStore.push). 못 올리면 그 자리가 이 서버에 남는다 — 다음 pull 이 그대로 준다. */
  private async push(name: string, dir: string, epoch: number, run: string): Promise<boolean> {
    try {
      const done = await this.storage.snapshots.push(dir, name, epoch);
      this.trace({ flow: 7, step: 5, run, unit: name, end: done ? 'ok' : 'refused', counts: { epoch } });
      this.log(`${name} fleet Store 를 ${done ? '올렸다' : '올리지 않았다 — 더 새 세대가 올라가 있다'} — 세대 ${epoch}`);
      return done;
    } catch (e) {
      this.trace({ flow: 7, step: 5, run, unit: name, end: 'failed', counts: { epoch } });
      this.log(`${name} fleet Store 를 올리지 못했다 — ${(e as Error).message} (이 서버의 자리에 남는다)`);
      return false;
    }
  }

  /** start — 흐름 1 의 6 · 7. 뷰어를 한 번 묶고(Spawner.bundle) 박자를 돌린다. 묶지 못하면 시작 거부. */
  async start(run: string = freshRun()): Promise<void> {
    const job = Spawner.bundle(this.config.engineDir, this.config.viewerOut);
    const errors: string[] = [];
    job.onLine((_s, line) => errors.push(line));
    const code = await job.exited;
    this.trace({ flow: 1, step: 2, run, unit: '-', end: code === 0 ? 'ok' : 'failed', counts: { exit: code } });
    if (code !== 0) throw new Error(`뷰어를 묶지 못했다 — exit ${code}${errors.length === 0 ? '' : ` — ${errors.slice(-3).join(' / ')}`}`);
    this.log(`fleet 뷰어를 묶었다 — ${this.config.viewerOut}`);
    this.clock.run(() => this.tick());
  }

  /** ready — 그 존의 ready 인 인스턴스들(세션 모듈의 Placer 가 고른다). 지금은 존 하나 = 세계 하나. */
  ready(zone: string): string[] {
    const shard = this.shards.get(zone);
    return zone === this.config.world && shard !== undefined && shard.state === 'ready' && shard.row.port !== null ? [zone] : [];
  }

  /** address — 그 인스턴스의 호스트 주소(내부망, 게이트웨이가 잇는다 — 흐름 9 의 10). ready 가 아니면 null. 클라이언트에게는 가지 않는다. */
  address(instance: string): string | null {
    return this.ready(instance).length === 0 ? null : `ws://${this.config.hostName}:${this.shards.get(instance)!.row.port}`;
  }

  /**
   * launch — 흐름 3 의 B(11 ~ 19). 그 존의 세계가 내려가 있으면 줄을 찾거나 내고 띄운다 — 섰으면 true. 이미 ready 면 false(띄울 곳이 없다 — 한 존에 인스턴스 여럿은 plan 07).
   * 뜨는 가운데면 그것을 기다린다. 띄우다 실패하면 던진다. run 은 세션 모듈이 넘긴 흐름 3 의 것.
   */
  launch(zone: string, run: string = freshRun()): Promise<boolean> {
    if (zone !== this.config.world) return Promise.resolve(false);
    if (this.launching !== null) return this.launching; // 한꺼번에 온 것은 하나를 기다린다 — 포트 · 줄을 한 번만
    this.launching = this.boot(zone, run).finally(() => (this.launching = null));
    return this.launching;
  }

  private async boot(name: string, run: string): Promise<boolean> {
    const take = async (): Promise<number> => {
      const port = await this.ports.take();
      this.trace({ flow: 3, step: 14, run, unit: name, end: port === null ? 'failed' : 'ok' }); // Ports.take
      if (port === null) throw new Error('빈 포트가 없다');
      return port;
    };
    let shard = this.shards.get(name);
    if (shard?.state === 'ready') return false;
    let row = this.assignment.get(name);
    if (row === null) {
      const port = await take();
      row = { dataset: this.config.dataset, port, epoch: 0 };
      await this.assignment.put(name, row);
    } else if (row.port === null) {
      row.port = await take();
      await this.assignment.put(name, row);
    }
    if (shard === undefined) {
      shard = new Shard(name, row, this.ctx);
      this.shards.set(name, shard);
    }
    await shard.start(run);
    shard.idle = 0;
    return true;
  }

  shardOf(name: string): Shard | null {
    return this.shards.get(name) ?? null;
  }

  /** tick — 흐름 5. status 를 묻고, 사람 없이 쉰 세계를 내리고, 백업 때면 내려간 뒤 올린 세계의 Store 를 백업한다. */
  async tick(): Promise<void> {
    this.ticks++;
    const run = freshRun();
    const ready = [...this.shards.values()].filter((s) => s.state === 'ready');
    const answers = await Promise.all(ready.map((s) => s.command('status')));
    ready.forEach((s, i) => this.trace({ flow: 5, step: 1, run, unit: s.name, end: answers[i] === null ? 'failed' : 'ok', counts: { players: s.players, idle: s.idle, lag: s.lag } })); // Console.command 의 일 — status(사람 수 · 지연)
    for (const s of ready) {
      if (s.state !== 'ready') continue;
      s.idle = s.players === 0 ? s.idle + 1 : 0;
      if (s.idle >= this.config.idleLimit) {
        this.ctx.log(`${s.name} fleet 사람 없이 ${s.idle} 박자 — 내린다`);
        this.trace({ flow: 5, step: 12, run, unit: s.name, end: 'ok', counts: { idle: s.idle } }); // Scaler.balance 의 일 — 쉬는 세계를 내린다(⇒ 흐름 7 의 4)
        void s.stop(run);
      }
    }
    if (this.config.backupEvery > 0 && this.ticks % this.config.backupEvery === 0) {
      for (const s of this.shards.values()) {
        if (s.state !== 'stopped' || !s.dirty) continue;
        try {
          const name = await this.storage.snapshots.copy(s.name); // Backuper.backup 의 일 — 올라간 것의 백업 하나
          s.dirty = false;
          this.log(`${s.name} fleet 백업했다 — ${name}`);
          this.trace({ flow: 5, step: 3, run, unit: s.name, end: 'ok' });
        } catch (e) {
          this.log(`${s.name} fleet 백업하지 못했다 — ${(e as Error).message}`);
          this.trace({ flow: 5, step: 3, run, unit: s.name, end: 'failed' }); // 다음 주기에 다시
        }
      }
    }
  }

  /** stopAll — 흐름 7 의 4. 살아 있는 세계를 전부 내린다. run 은 Service.stop 의 것. */
  async stopAll(run: string = freshRun()): Promise<void> {
    await Promise.all([...this.shards.values()].map((s) => s.stop(run)));
  }
}
