// Fleet — 플릿 모듈의 조립: 컨트롤 플레인의 반(Registry · Scheduler · Scaler · Recoverer)과 이 서버의 노드의 반(Runner · Console · Ports · Loader · Backuper)
// (design/02-roles/fleet.md). 지금은 노드 하나가 같은 프로세스에 있다 — NodeRpc 는 함수 부름(노드 여럿 · NodeReporter · Nodes 는 plan 08).
// launch 는 흐름 3 의 B, load · unload 는 흐름 9 · 10 · 11 의 Loader, tick 은 흐름 5 의 A(와 C 의 12 — Scaler), stop · stopAll 은 흐름 7 의 3 ~ 6, 호스트의 끝은 흐름 4 → 7 · 12.
// 누가 누구인가를 모른다 — 세션 모듈의 기능(count · move · drain · handoff)은 앱이 준 함수. 게임 명사를 모른다 — 존의 데이터셋 · NPC 묶음은 설정 값.

import type { TraceFn } from '../protocol/observe';
import type { ZoneSpec } from '../protocol/session';
import type { StorageSocket } from '../protocol/storage';
import { Backuper } from './backuper';
import { Clock } from './clock';
import { Console } from './console';
import type { Instance } from './instance';
import { holderOf } from './instance';
import { Loader } from './loader';
import { Operator } from './operator';
import { Ports } from './ports';
import { Recoverer } from './recoverer';
import { Registry } from './registry';
import { Runner, freshRun } from './runner';
import { Scaler } from './scaler';
import { Scheduler } from './scheduler';
import { Spawner } from './spawner';

export { freshRun };

export interface FleetConfig {
  readonly engineDir: string;
  /** 사람의 묶음의 틀 — 엔진의 --party(body 이름). */
  readonly party: string;
  /** 뷰어의 묶음이 놓일 자리(viewer.js) — Fleet.start 가 한 번 묶는다. Static 이 준다. */
  readonly viewerOut: string;
  readonly beat: number;
  readonly sparse: number;
  /** NPC 계정과, 존의 줄에 npc 가 없을 때의 NPC 묶음 */
  readonly npc: { readonly account: string; readonly bodies: readonly string[] };
  readonly ports: readonly [number, number];
  /** 게이트웨이에서 호스트가 보이는 이름 — 내부망(Node.host) */
  readonly hostName: string;
  /** 이 서버의 노드 — 이름과 slots(띄울 수 있는 인스턴스의 수) */
  readonly node: { readonly name: string; readonly slots: number };
  /** 이 서버의 디렉터리 — 인스턴스마다 건넴 자리(캐릭터 파일)와 백업의 사본 */
  readonly spool: string;
  readonly clockMs: number;
  /** 사람 없이 이만큼 Clock 이 지나면 쉬는 인스턴스다(Scaler). */
  readonly idleLimit: number;
  readonly startLimitMs: number;
  readonly stopLimitMs: number;
  readonly commandLimitMs: number;
  readonly restartLimit: number;
  /** 이만큼 Clock 마다 도는 인스턴스를 백업한다(흐름 5 의 3). 0 이면 하지 않는다. */
  readonly backupEvery: number;
  /** 인스턴스마다 남기는 백업의 수 */
  readonly backupKeep: number;
}

/** 존의 줄 — 세션 모듈의 Zone 에 이 존의 NPC 묶음(없으면 설정의 npc.bodies)을 더한 것. */
export type FleetZone = ZoneSpec & { readonly npc?: readonly string[] };

/** 세션 모듈의 기능 — 앱이 준다(design/02-roles/session.md 의 머리). */
export interface FleetHooks {
  /** 그 인스턴스에 잡힌 슬롯 — Scaler */
  count(instance: string): number;
  /** 죽은 인스턴스의 사람을 다시 배정한다 — Recoverer(흐름 12 의 4 · 5) */
  move(instance: string, run: string): Promise<void>;
  /** 그 인스턴스의 사람을 다른 인스턴스로 — Operator 의 drain(흐름 10) */
  drain(instance: string, run: string): Promise<number>;
  /** NodeRpc handoff — 호스트의 떠남 줄(흐름 10) */
  handoff(instance: string, character: string, to: string, run: string): void;
}

/** Fleet 이 닿는 스토리지. */
export type FleetStorage = Pick<StorageSocket, 'database' | 'snapshots' | 'leases' | 'characters'>;

export class Fleet {
  // 데이터 — 개념들(참조)과 설정
  readonly registry: Registry;
  readonly scheduler: Scheduler;
  readonly scaler: Scaler;
  readonly recoverer: Recoverer;
  readonly runner: Runner;
  readonly console: Console;
  readonly ports: Ports;
  readonly loader: Loader;
  readonly backuper: Backuper;
  readonly clock: Clock;
  readonly operator: Operator;
  readonly storage: FleetStorage;
  readonly config: FleetConfig;
  readonly zones: readonly FleetZone[];
  readonly build: string;
  readonly hooks: FleetHooks;
  ticks = 0;
  /** 노드가 내려가는 가운데 — 새로 띄우지 않는다(흐름 7) */
  closing = false;
  /** 흔적을 남긴다 — 앱이 준 Monitor.trace(흐름 14). */
  readonly trace: TraceFn;
  readonly log: (line: string) => void;
  /** 존마다 뜨는 가운데의 launch — 한꺼번에 온 것은 이것을 기다린다 */
  private readonly launching = new Map<string, Promise<boolean>>();
  /** 내리는 가운데의 인스턴스 — 호스트의 끝(올림 · 줄)까지 */
  private readonly settling = new Map<string, { promise: Promise<void>; resolve: () => void }>();
  /** status 의 답이 잇달아 없은 수 */
  private readonly silent = new Map<string, number>();

  /**
   * 흐름 1 의 1 · 7 — 엔진 체크아웃이 없으면 시작 거부(Spawner.missing), 표 `instances` 를 읽는다. 프로세스는 띄우지 않는다.
   * 지난 실행에서 떠 있던 줄(이 프로세스와 함께 끝났다)은 그 세대의 lease 를 끊고 stopped 로 — 다음 띄움이 같은 이름 · Store 로 잇는다.
   */
  static async open(
    config: FleetConfig,
    zones: readonly FleetZone[],
    build: string,
    storage: FleetStorage,
    key: string,
    issue: (account: string) => string,
    hooks: FleetHooks,
    log: (line: string) => void = (l) => console.log(l),
    trace: TraceFn = () => {},
    run: string = freshRun(),
  ): Promise<Fleet> {
    const missing = Spawner.missing(config.engineDir);
    trace({ flow: 1, step: 7, run, unit: '-', end: missing === null ? 'ok' : 'refused' });
    if (missing !== null) throw new Error(missing);
    const { registry, skipped } = await Registry.load(storage.database);
    if (skipped.length > 0) log(`fleet 표 instances 의 모양이 아닌 줄을 건너뛴다 — ${skipped.join(' ')}`);
    const fleet = new Fleet(config, zones, build, storage, registry, key, issue, hooks, log, trace);
    for (const i of registry.all()) {
      if (i.state === 'starting' || i.state === 'ready' || i.state === 'stopping') {
        await storage.leases.expire(holderOf(i)).catch(() => {}); // 지난 실행의 호스트는 없다 — 값은 마지막으로 저장한 것
        i.state = 'stopped';
        i.port = null;
        await registry.put(i);
      }
      trace({ flow: 1, step: 1, run, unit: i.name, end: 'ok', state: i.state, counts: { players: 0 } }); // 표의 줄마다
    }
    return fleet;
  }

  private constructor(
    config: FleetConfig,
    zones: readonly FleetZone[],
    build: string,
    storage: FleetStorage,
    registry: Registry,
    key: string,
    issue: (account: string) => string,
    hooks: FleetHooks,
    log: (line: string) => void,
    trace: TraceFn,
  ) {
    this.config = config;
    this.zones = zones;
    this.build = build;
    this.storage = storage;
    this.registry = registry;
    this.hooks = hooks;
    this.trace = trace;
    this.log = log;
    this.ports = new Ports(config.ports);
    this.clock = new Clock(config.clockMs);
    this.scheduler = new Scheduler(registry, { name: config.node.name, build, slots: config.node.slots }, config.restartLimit);
    this.scaler = new Scaler(registry, (i) => hooks.count(i), zones, config.idleLimit);
    let runner: Runner | null = null;
    this.console = new Console(config.commandLimitMs, (name) => runner?.get(name)?.host ?? null);
    runner = new Runner({
      engineDir: config.engineDir,
      beat: config.beat,
      sparse: config.sparse,
      party: config.party,
      npcAccount: config.npc.account,
      startLimitMs: config.startLimitMs,
      stopLimitMs: config.stopLimitMs,
      restartLimit: config.restartLimit,
      key,
      spool: config.spool,
      ports: this.ports,
      console: this.console,
      issue,
      pull: (name, run) => this.pull(name, run),
      handoff: (instance, character, to, run) => hooks.handoff(instance, character, to, run),
      exited: (instance, epoch, code, stopped, run) => void this.exited(instance, epoch, code, stopped, run),
      log,
      trace,
    });
    this.runner = runner;
    this.loader = new Loader(storage.leases, storage.characters, this.console, runner, trace, log);
    this.backuper = new Backuper(storage.snapshots, this.console, runner, config.backupKeep, config.commandLimitMs * 10, trace, log);
    this.recoverer = new Recoverer(registry, storage.leases, (i, r) => hooks.move(i, r), (zone, name, r) => this.launch(zone, build, r, name), config.restartLimit, trace, log);
    this.operator = new Operator(this);
  }

  /** 흐름 3 의 13 — 그 인스턴스의 Store 를 이 서버에(SnapshotStore.pull). */
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

  /** start — 흐름 1 의 2. 뷰어를 한 번 묶고(Spawner.bundle) 박자를 돌린다. 묶지 못하면 시작 거부. */
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

  zoneOf(name: string): FleetZone | null {
    return this.zones.find((z) => z.name === name) ?? null;
  }

  /** ready — 그 존의 ready 이고 비우는 가운데가 아닌 인스턴스들과 그 빌드(세션 모듈의 Placer 가 고른다). */
  ready(zone: string): { readonly name: string; readonly build: string }[] {
    return this.registry.ready(zone).filter((i) => this.runner.get(i.name)?.state === 'ready').map((i) => ({ name: i.name, build: i.build }));
  }

  /** address — 그 인스턴스의 호스트 주소(내부망, 게이트웨이가 잇는다 — 흐름 9 의 10). 떠 있지 않으면 null. 클라이언트에게는 가지 않는다. */
  address(name: string): string | null {
    const i = this.registry.get(name);
    return i === null || i.state !== 'ready' || i.port === null ? null : `ws://${this.config.hostName}:${i.port}`;
  }

  /**
   * launch — 흐름 3 의 B. 그 존에 인스턴스 하나를 띄운다 — 섰으면 true, 띄울 곳이 없으면 false. 그 존이 뜨는 가운데면 그것을 기다린다.
   * 띄우다 실패하면 줄을 failed 로 하고 던진다. want 는 흐름 12 의 6(같은 이름으로). run 은 부른 흐름의 것.
   */
  launch(zone: string, build: string, run: string = freshRun(), want: string | null = null): Promise<boolean> {
    const busy = this.launching.get(zone);
    if (busy !== undefined) return busy;
    const job = this.boot(zone, build, run, want).finally(() => this.launching.delete(zone));
    this.launching.set(zone, job);
    return job;
  }

  private async boot(zoneName: string, build: string, run: string, want: string | null): Promise<boolean> {
    const zone = this.zoneOf(zoneName);
    if (zone === null || this.closing) return false;
    const at = this.scheduler.place(zoneName, build, want);
    this.trace({ flow: 3, step: 10, run, unit: at?.name ?? zoneName, end: at === null ? 'refused' : 'ok' }); // Scheduler.place
    if (at === null) return false;
    const was = this.registry.get(at.name);
    const i: Instance = was ?? { name: at.name, zone: zoneName, node: at.node, port: null, epoch: 0, build, state: 'stopped', draining: false, restarts: 0 };
    i.node = at.node;
    i.build = build;
    i.state = 'starting';
    i.port = null;
    i.draining = false;
    i.epoch++; // 세대를 하나 올려 starting 으로 — 띄우기 전에 적는다
    try {
      await this.registry.put(i);
    } catch (e) {
      i.state = was?.state ?? 'stopped';
      i.epoch--;
      this.trace({ flow: 3, step: 11, run, unit: i.name, end: 'failed' });
      throw new Error(`줄을 적지 못했다 — ${(e as Error).message}`);
    }
    this.trace({ flow: 3, step: 11, run, unit: i.name, end: 'ok', state: 'starting', counts: { epoch: i.epoch } }); // Registry.put
    let port: number;
    try {
      port = await this.runner.start({ name: i.name, epoch: i.epoch, dataset: zone.dataset, npc: zone.npc ?? this.config.npc.bodies }, run);
    } catch (e) {
      const refused = (e as { refused?: boolean }).refused === true;
      const asked = this.runner.get(i.name)?.state === 'stopped';
      i.state = asked ? 'stopped' : 'failed';
      if (!asked) i.restarts = refused ? this.config.restartLimit + 1 : i.restarts + 1; // 같은 인자로 다시 띄워도 같다
      await this.registry.put(i).catch(() => {});
      this.trace({ flow: 3, step: 12, run, unit: i.name, end: 'failed', state: i.state, counts: { restarts: i.restarts } }); // Runner.start
      throw e;
    }
    this.trace({ flow: 3, step: 12, run, unit: i.name, end: 'ok' }); // Runner.start
    i.port = port;
    i.state = 'ready';
    i.restarts = 0;
    this.silent.delete(i.name);
    await this.registry.put(i).catch((e: unknown) => this.log(`${i.name} fleet 줄을 적지 못했다 — ${(e as Error).message}`));
    this.trace({ flow: 3, step: 19, run, unit: i.name, end: 'ok', state: 'ready', counts: { port, players: 0, epoch: i.epoch } }); // Registry.put
    return true;
  }

  /** load — Loader.load(흐름 9 의 5 ~ 7). NodeRpc load 의 받는 쪽 — 세션 모듈이 부른다. */
  load(instance: string, character: string, spot: string | null, run: string): Promise<string | null> {
    return this.loader.load(instance, character, spot, run);
  }

  /** unload — Loader.unload(흐름 10 의 5 ~ 7). NodeRpc unload 의 받는 쪽. */
  unload(instance: string, character: string, run: string): Promise<string | null> {
    return this.loader.unload(instance, character, run);
  }

  /**
   * tick — 흐름 5 의 A 와 C 의 12. 도는 호스트마다 status 를 묻고(1), 캐릭터의 값을 저장하고(2), 백업 때면 Store 의 사본을 올린다(3).
   * 그 뒤 Scaler 가 존마다 예비 용량을 맞춘다(12 — 띄우거나 쉬는 · 다 비운 인스턴스를 내린다).
   */
  async tick(): Promise<void> {
    this.ticks++;
    const run = freshRun();
    const ready = this.registry.all().filter((i) => i.state === 'ready' && this.runner.get(i.name)?.state === 'ready');
    const answers = await Promise.all(ready.map((i) => this.console.command(i.name, 'status')));
    ready.forEach((i, k) => {
      const server = this.runner.get(i.name)!;
      const none = answers[k] === null;
      const missed = none ? (this.silent.get(i.name) ?? 0) + 1 : 0;
      this.silent.set(i.name, missed);
      server.idle = server.players === 0 && this.hooks.count(i.name) === 0 ? server.idle + 1 : 0;
      this.trace({ flow: 5, step: 1, run, unit: i.name, end: none ? 'failed' : 'ok', counts: { players: server.players, sessions: this.hooks.count(i.name), idle: server.idle, lag: server.lag } }); // Console.command — status(사람 수 · 지연)
      if (missed >= 3) {
        this.log(`${i.name} fleet status 의 답이 ${missed} 번 잇달아 없다 — 멈춘 것이다, 끝낸다`);
        server.host?.kill('SIGKILL'); // ⇒ 흐름 4 → 12
      }
    });
    for (const i of ready) await this.loader.save(i.name, run); // Loader.save — 흔적은 Loader 가
    if (this.config.backupEvery > 0 && this.ticks % this.config.backupEvery === 0) {
      for (const i of ready) if (this.runner.get(i.name)?.state === 'ready') await this.backuper.backup(i.name, i.epoch, run);
    }
    const plan = this.scaler.balance((name) => this.runner.get(name)?.idle ?? 0);
    for (const zone of plan.launch) {
      this.trace({ flow: 5, step: 12, run, unit: zone, end: 'ok', counts: { launch: 1 } }); // Scaler.balance — 예비 용량이 모자라다 ⇒ 흐름 3 의 B
      void this.launch(zone, this.build, run).catch((e: unknown) => this.log(`${zone} fleet 예비 인스턴스를 띄우지 못했다 — ${(e as Error).message}`));
    }
    for (const s of plan.stop) {
      this.trace({ flow: 5, step: 12, run, unit: s.name, end: 'ok', counts: s.why === 'idle' ? { idle: this.runner.get(s.name)?.idle ?? 0 } : { drained: 1 } }); // Scaler.balance ⇒ 흐름 7 의 3 ~ 6
      this.log(`${s.name} fleet ${s.why === 'idle' ? '사람 없이 쉬었다' : '다 비웠다'} — 내린다`);
      void this.stop(s.name, run);
    }
  }

  /**
   * stop — 흐름 7 의 3 ~ 6. 남은 캐릭터의 값을 내려 저장하고(3), 호스트를 내리고(4), 끝나면 Store 를 올리고(5) 줄을 stopped 로(6). 사람을 옮기지 않는다.
   * 호스트의 끝(올림 · 줄)까지 기다린다. 두 번 불려도 한 번.
   */
  async stop(name: string, run: string = freshRun()): Promise<void> {
    const was = this.settling.get(name);
    if (was !== undefined) return was.promise;
    const server = this.runner.get(name);
    const i = this.registry.get(name);
    if (server === null || i === null || server.state === 'stopped' || server.state === 'failed') return;
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    this.settling.set(name, { promise, resolve });
    if (server.state === 'starting') {
      await this.runner.stop(name, run); // 뜨는 가운데 — Runner.start 가 보고 그만둔다
      const job = this.launching.get(i.zone);
      if (job !== undefined) await job.catch(() => false);
      this.settling.delete(name);
      resolve();
      return;
    }
    i.state = 'stopping';
    await this.registry.put(i).catch(() => {});
    const left = this.loader.of(name);
    for (const character of left) {
      const why = await this.loader.unload(name, character, run); // 흐름 7 의 3 — 흔적은 Loader 가(흐름 10 의 5 ~ 7)
      this.trace({ flow: 7, step: 3, run, unit: name, end: why === null ? 'ok' : 'failed' }); // Loader.unload
    }
    await this.runner.stop(name, run); // 흐름 7 의 4 — 흔적은 Runner 가
    await promise; // 호스트의 끝 ⇒ 5 · 6
  }

  /** 호스트가 끝났다(NodeRpc exited — 흐름 4 의 5). 내림이면 흐름 7 의 5 · 6, 아니면 흐름 12. */
  private async exited(name: string, epoch: number, code: number, stopped: boolean, run: string): Promise<void> {
    this.silent.delete(name);
    const server = this.runner.get(name);
    const i = this.registry.get(name);
    if (!stopped) {
      this.loader.forget(name);
      const settle = this.settling.get(name);
      this.settling.delete(name);
      settle?.resolve();
      await this.recoverer.recover(name, epoch, server?.why ?? `exit ${code}`, run);
      return;
    }
    this.loader.forget(name); // 남은 것은 흐름 7 의 3 이 내렸다 — 내리지 못한 값은 마지막으로 저장한 것
    if (server?.store != null && i !== null) await this.backuper.upload(name, server.store, epoch, run); // 흐름 7 의 5
    if (i !== null && i.epoch === epoch) {
      i.state = 'stopped';
      i.port = null;
      i.draining = false;
      try {
        await this.registry.put(i);
        this.trace({ flow: 7, step: 6, run, unit: name, end: 'ok', state: 'stopped', counts: { players: 0 } }); // Registry.put
      } catch {
        this.trace({ flow: 7, step: 6, run, unit: name, end: 'failed', state: 'stopped' });
      }
    }
    const settle = this.settling.get(name);
    this.settling.delete(name);
    settle?.resolve();
  }

  /** stopAll — 흐름 7 의 3 ~ 6 을 떠 있는 인스턴스마다(노드가 내려간다). run 은 Service.stop 의 것. 사람을 옮길 다른 노드는 plan 08. */
  async stopAll(run: string = freshRun()): Promise<void> {
    this.closing = true; // 새로 띄우지 않는다 — 수습(흐름 12)의 다시 띄움도
    this.clock.stop();
    const all = (): Promise<unknown> => Promise.all([...this.runner.servers.keys()].map((name) => this.stop(name, run)));
    await all(); // 뜨는 가운데의 것은 그만두게 한다
    await Promise.all([...this.launching.values()].map((j) => j.catch(() => false)));
    await all(); // 그 사이에 선 것
  }
}
