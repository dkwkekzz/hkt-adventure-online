// NodeAgent — 노드 모듈의 조립: Runner · Console · Ports · Loader · Backuper · NodeReporter · Clock (design/02-roles/node.md, design/README.md 의 노드 에이전트).
// 이 서버의 인스턴스의 프로세스를 띄우고 내리고, 캐릭터의 값을 올리고 내린다. 무엇을 띄울지 · 누구를 올릴지는 컨트롤 플레인이 정한다 — 받는 것은 NodeRpc(NodeSocket),
// 알리는 것은 앱이 준 ControlSocket(register · report · handoff · exited). 노드는 줄(Registry)을 모른다.
// start 는 흐름 1 의 7 ~ 10, tick 은 흐름 5 의 A(1 ~ 4), launch 는 흐름 3 의 13 ~ 18, stop 은 흐름 7 의 3 ~ 5, close 는 흐름 7 의 1 · 3 ~ 5.

import type { ControlSocket, LaunchSpec, Launched, NodeHello, NodeSocket } from '../protocol/node';
import type { TraceFn } from '../protocol/observe';
import type { StorageSocket } from '../protocol/storage';
import { Backuper } from './backuper';
import { Clock } from './clock';
import { Console } from './console';
import { Loader } from './loader';
import { NodeReporter } from './node-reporter';
import { Ports } from './ports';
import { Runner, freshRun } from './runner';
import { Spawner } from './spawner';

/** 노드의 설정 — service.config.json 의 fleet 가운데 노드의 것. */
export interface NodeConfig {
  readonly engineDir: string;
  /** 사람의 묶음의 틀 — 엔진의 --party(body 이름) */
  readonly party: string;
  readonly beat: number;
  readonly sparse: number;
  /** NPC 계정 — 묶음은 컨트롤 플레인이 띄울 때 준다(존의 줄) */
  readonly npcAccount: string;
  readonly ports: readonly [number, number];
  /** 이 노드 — 이름 · slots 와, 내부망에서 호스트가 보이는 이름(host) · NodeRpc 의 주소(address) */
  readonly node: { readonly name: string; readonly slots: number; readonly host: string; readonly address: string };
  /** 이 서버의 디렉터리 — 인스턴스마다 건넴 자리(캐릭터 파일) · 프로세스 기록 · 백업의 사본 */
  readonly spool: string;
  readonly clockMs: number;
  readonly startLimitMs: number;
  readonly stopLimitMs: number;
  readonly commandLimitMs: number;
  /** 에이전트가 이만큼 잇달아 끝나면 호스트를 내린다 */
  readonly restartLimit: number;
  /** 이만큼 Clock 마다 도는 인스턴스를 백업한다(흐름 5 의 3). 0 이면 하지 않는다 */
  readonly backupEvery: number;
  readonly backupKeep: number;
  /** 내려갈 때 사람이 옮겨지기를 기다리는 한계(흐름 7 의 3) */
  readonly closingMs: number;
}

/** 노드가 닿는 스토리지 — Store(SnapshotStore)와 캐릭터의 값(CharacterStore · Leases). */
export type NodeStorage = Pick<StorageSocket, 'snapshots' | 'leases' | 'characters'>;

export class NodeAgent implements NodeSocket {
  // 데이터 — 개념들(참조)과 설정
  readonly runner: Runner;
  readonly console: Console;
  readonly ports: Ports;
  readonly loader: Loader;
  readonly backuper: Backuper;
  readonly reporter: NodeReporter;
  readonly clock: Clock;
  readonly config: NodeConfig;
  readonly build: string;
  ticks = 0;
  private readonly storage: NodeStorage;
  private readonly control: ControlSocket;
  private readonly trace: TraceFn;
  private readonly log: (line: string) => void;
  /** status 의 답이 잇달아 없은 수 */
  private readonly silent = new Map<string, number>();
  /** 내리는 가운데의 인스턴스 — 호스트의 끝(올림)까지 */
  private readonly settling = new Map<string, { promise: Promise<void>; resolve: () => void }>();
  private closed: Promise<void> | null = null;

  constructor(config: NodeConfig, build: string, storage: NodeStorage, key: string, issue: (account: string) => string, control: ControlSocket, log: (line: string) => void, trace: TraceFn) {
    this.config = config;
    this.build = build;
    this.storage = storage;
    this.control = control;
    this.trace = trace;
    this.log = log;
    this.ports = new Ports(config.ports);
    this.clock = new Clock(config.clockMs);
    let runner: Runner | null = null;
    this.console = new Console(config.commandLimitMs, (name) => runner?.get(name)?.host ?? null);
    runner = new Runner({
      engineDir: config.engineDir,
      beat: config.beat,
      sparse: config.sparse,
      party: config.party,
      npcAccount: config.npcAccount,
      startLimitMs: config.startLimitMs,
      stopLimitMs: config.stopLimitMs,
      restartLimit: config.restartLimit,
      key,
      spool: config.spool,
      ports: this.ports,
      console: this.console,
      issue,
      pull: (name, run) => this.pull(name, run),
      handoff: (instance, character, to, run) => control.handoff(instance, character, to, run), // NodeRpc handoff
      exited: (instance, epoch, code, stopped, run) => void this.exited(instance, epoch, code, stopped, run),
      log,
      trace,
    });
    this.runner = runner;
    this.loader = new Loader(storage.leases, storage.characters, this.console, runner, trace, log);
    this.backuper = new Backuper(storage.snapshots, this.console, runner, config.backupKeep, config.commandLimitMs * 10, trace, log);
    const hello: NodeHello = { name: config.node.name, address: config.node.address, host: config.node.host, build, slots: config.node.slots };
    this.reporter = new NodeReporter(hello, runner, this.loader, control);
  }

  get name(): string {
    return this.config.node.name;
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

  /**
   * start — 흐름 1 의 7 ~ 10. 엔진 체크아웃이 없으면 시작 거부, 지난 실행이 남긴 프로세스를 끝내고, 저장하지 못한 캐릭터 파일을 저장하고, 컨트롤 플레인에 알린다.
   * 그 뒤로 간격마다 흐름 5 의 A.
   */
  async start(run: string = freshRun()): Promise<void> {
    const missing = Spawner.missing(this.config.engineDir);
    this.trace({ flow: 1, step: 7, run, unit: this.name, end: missing === null ? 'ok' : 'refused' }); // Spawner.missing
    if (missing !== null) throw new Error(missing);
    const reaped = this.runner.reap();
    this.trace({ flow: 1, step: 8, run, unit: this.name, end: 'ok', counts: { reaped } }); // Runner.reap
    if (reaped > 0) this.log(`${this.name} fleet 지난 실행이 남긴 프로세스 ${reaped} 개를 끝냈다`);
    await this.loader.recover(this.config.spool, `${this.name}@recover`, run); // Loader.recover — 흔적은 Loader 가
    this.trace({ flow: 1, step: 10, run, unit: this.name, end: 'ok', counts: { slots: this.config.node.slots } }); // NodeReporter.register — 알린다
    this.reporter.register(run);
    this.reporter.report(run); // 든 것(처음에는 빈 것)을 바로 알린다 — 컨트롤 플레인이 표를 세우는 데(흐름 13 의 6) 다음 간격을 기다리지 않게
    this.clock.run(() => this.tick());
  }

  /** launch — NodeRpc launch(흐름 3 의 13 ~ 18). 내려가는 가운데면 거절. */
  async launch(instance: string, epoch: number, spec: LaunchSpec, run: string): Promise<Launched> {
    if (this.reporter.closing) return { why: '노드가 내려가는 가운데다', refused: false, stopped: false };
    try {
      const port = await this.runner.start({ name: instance, epoch, dataset: spec.dataset, npc: spec.npc }, run);
      this.silent.delete(instance);
      return { port };
    } catch (e) {
      return { why: (e as Error).message, refused: (e as { refused?: boolean }).refused === true, stopped: this.runner.get(instance)?.state === 'stopped' };
    }
  }

  /** command — NodeRpc command. 그 호스트의 Console 에 글 한 줄. */
  command(instance: string, line: string, _run: string): Promise<string | null> {
    return this.console.command(instance, line);
  }

  /** load · unload — NodeRpc load · unload(Loader). */
  load(instance: string, character: string, spot: string | null, run: string): Promise<string | null> {
    return this.loader.load(instance, character, spot, run);
  }

  unload(instance: string, character: string, run: string): Promise<string | null> {
    return this.loader.unload(instance, character, run);
  }

  /**
   * tick — 흐름 5 의 A. 도는 호스트마다 status 를 묻고(1 — 답이 잇달아 없으면 끝낸다), 캐릭터의 값을 저장하고(2), 백업 때면 Store 의 사본을 올리고(3), 든 것을 알린다(4).
   */
  async tick(): Promise<void> {
    this.ticks++;
    const run = freshRun();
    const ready = [...this.runner.servers.values()].filter((s) => s.state === 'ready');
    const answers = await Promise.all(ready.map((s) => this.console.command(s.name, 'status')));
    ready.forEach((s, k) => {
      const none = answers[k] === null;
      const missed = none ? (this.silent.get(s.name) ?? 0) + 1 : 0;
      this.silent.set(s.name, missed);
      s.idle = s.players === 0 && this.loader.of(s.name).length === 0 ? s.idle + 1 : 0;
      this.trace({ flow: 5, step: 1, run, unit: s.name, end: none ? 'failed' : 'ok', counts: { players: s.players, loaded: this.loader.of(s.name).length, idle: s.idle, lag: s.lag } }); // Console.command — status(사람 수 · 지연)
      if (missed >= 3) {
        this.log(`${s.name} fleet status 의 답이 ${missed} 번 잇달아 없다 — 멈춘 것이다, 끝낸다`);
        s.host?.kill('SIGKILL'); // ⇒ 흐름 4 → 12
      }
    });
    for (const s of ready) await this.loader.save(s.name, run); // Loader.save — 흔적은 Loader 가
    if (this.config.backupEvery > 0 && this.ticks % this.config.backupEvery === 0) {
      for (const s of ready) if (s.state === 'ready') await this.backuper.backup(s.name, s.epoch, run);
    }
    const report = this.reporter.report(run);
    this.trace({ flow: 5, step: 4, run, unit: this.name, end: 'ok', counts: { instances: report.instances.length, loaded: report.instances.reduce((n, i) => n + i.loaded.length, 0) } }); // NodeReporter.report
  }

  /**
   * stop — NodeRpc stop(흐름 7 의 3 ~ 5). 남은 캐릭터의 값을 내려 저장하고(3), 호스트를 내리고(4), 끝나면 Store 를 올리고(5) 컨트롤 플레인에 알린다(⇒ 6).
   * 호스트의 끝(올림)까지 기다린다. 두 번 불려도 한 번. 뜨는 가운데면 그만두게 한다.
   */
  async stop(instance: string, run: string): Promise<void> {
    const was = this.settling.get(instance);
    if (was !== undefined) return was.promise;
    const server = this.runner.get(instance);
    if (server === null || server.state === 'stopped' || server.state === 'failed') return;
    if (server.state === 'starting') {
      await this.runner.stop(instance, run); // Runner.start 가 보고 그만둔다 — launch 의 답이 stopped 다
      return;
    }
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    this.settling.set(instance, { promise, resolve });
    for (const character of this.loader.of(instance)) {
      const why = await this.loader.unload(instance, character, run); // 흐름 7 의 3 — 흔적은 Loader 가(흐름 10 의 5 ~ 7)
      this.trace({ flow: 7, step: 3, run, unit: instance, end: why === null ? 'ok' : 'failed' }); // Loader.unload
    }
    await this.runner.stop(instance, run); // 흐름 7 의 4 — 흔적은 Runner 가
    await promise; // 호스트의 끝 ⇒ 5
  }

  /** 호스트가 끝났다(Runner.exited — 흐름 4 의 5). 내림이면 Store 를 올리고(흐름 7 의 5), 컨트롤 플레인에 알린다(NodeRpc exited). */
  private async exited(name: string, epoch: number, code: number, stopped: boolean, run: string): Promise<void> {
    this.silent.delete(name);
    const server = this.runner.get(name);
    this.loader.forget(name); // 내림이면 남은 것은 7 의 3 이 내렸다, 죽음이면 lease 는 컨트롤 플레인이 끊는다(흐름 12 의 3)
    if (stopped && server?.store != null) await this.backuper.upload(name, server.store, epoch, run); // 흐름 7 의 5
    this.control.exited(name, epoch, code, stopped, run); // NodeRpc exited ⇒ 7 의 6 또는 흐름 12
    const settle = this.settling.get(name);
    this.settling.delete(name);
    settle?.resolve();
  }

  /**
   * close — 흐름 7 의 노드의 일. 내려간다고 알리고(1 — 컨트롤 플레인이 사람을 다른 노드로 옮긴다, 2), 인스턴스가 비었거나 한계(closingMs)가 지나면
   * 남은 값을 내려 저장하고 호스트를 내리고 Store 를 올린다(3 ~ 5). 두 번 불려도 한 번.
   */
  close(run: string = freshRun(), wait = true): Promise<void> {
    if (this.closed !== null) return this.closed;
    this.closed = (async () => {
      this.clock.stop();
      this.reporter.closing = true;
      this.trace({ flow: 7, step: 1, run, unit: this.name, end: 'ok', state: 'closing' }); // NodeReporter.report(closing) — 알린다
      this.reporter.report(run);
      const until = Date.now() + (wait ? this.config.closingMs : 0);
      while (Date.now() < until && [...this.runner.servers.keys()].some((n) => this.loader.of(n).length > 0)) {
        await new Promise((r) => setTimeout(r, 100));
        this.reporter.report(run); // 옮겨지는 동안 알린다 — 컨트롤 플레인이 남은 사람을 본다
      }
      await Promise.all([...this.runner.servers.keys()].map((n) => this.stop(n, run)));
    })();
    return this.closed;
  }
}
