// Fleet — 플릿 모듈의 조립(컨트롤 플레인): Registry · Nodes · Scheduler · Scaler · Recoverer · Operator (design/02-roles/fleet.md).
// 어느 노드에 무엇이 있는가를 들고, 노드에는 NodeRpc(앱이 준 nodeOf — 개발의 main 에서는 같은 프로세스의 NodeAgent, 갈리면 내부망의 글)로만 닿는다.
// 노드가 알리는 것(register · report · handoff · exited)을 받는다 — ControlSocket. launch 는 흐름 3 의 B, tick 은 흐름 5 의 C(10 · 12 와 세션의 11 · 13 · 14 · 계정의 15),
// report 는 흐름 5 의 7(과 9 — 세션에 넘긴다) · 7 의 1 · 2, exited 는 흐름 7 의 6 또는 흐름 12, stop 은 흐름 7 의 3 ~ 6.
// 누가 누구인가를 모른다 — 세션 모듈의 기능(count · move · drain · handoff · reconcile · tick)과 계정의 sweep 은 앱이 준 함수. 게임 명사를 모른다 — 존의 데이터셋 · NPC 묶음은 설정 값.
// 활성(active)이 아니면 — 컨트롤 플레인이 막 바뀌어 표가 서는 가운데(흐름 13) — 띄우지도 내리지도 죽음을 판정하지도 않는다.

import { randomBytes } from 'node:crypto';
import type { ControlSocket, InstanceReport, NodeHello, NodeReport, NodeSocket } from '../protocol/node';
import type { TraceFn } from '../protocol/observe';
import type { ZoneSpec } from '../protocol/session';
import type { StorageSocket } from '../protocol/storage';
import { Clock } from './clock';
import type { Instance } from './instance';
import { Nodes } from './nodes';
import { Operator } from './operator';
import type { OperatorHooks } from './operator';
import { Recoverer } from './recoverer';
import { Registry } from './registry';
import { Scaler } from './scaler';
import { Scheduler } from './scheduler';

/** 한 번의 실행의 이름(흐름 14 의 run) */
export const freshRun = (): string => randomBytes(4).toString('hex');

/** service.config.json 의 fleet 가운데 컨트롤 플레인이 읽는 것(노드의 것은 노드 모듈의 NodeConfig). */
export interface FleetConfig {
  /** NPC 계정과, 존의 줄에 npc 가 없을 때의 NPC 묶음 — 띄울 때 노드에 준다(LaunchSpec) */
  readonly npc: { readonly account: string; readonly bodies: readonly string[] };
  readonly clockMs: number;
  /** 사람 없이 이만큼 Clock 이 지나면 쉬는 인스턴스다(Scaler). */
  readonly idleLimit: number;
  readonly stopLimitMs: number;
  /** 죽은 셈이 이만큼을 넘으면 다시 띄우지 않는다(흐름 12 의 6) */
  readonly restartLimit: number;
  /** 노드의 보고가 이만큼 없으면 끊긴 것이다(흐름 5 의 10) */
  readonly reportLimitMs: number;
}

/** 존의 줄 — 세션 모듈의 Zone 에 이 존의 NPC 묶음(없으면 설정의 npc.bodies)을 더한 것. */
export type FleetZone = ZoneSpec & { readonly npc?: readonly string[] };

/** 세션 모듈 · 계정의 기능 — 앱이 준다(design/02-roles/session.md 의 머리). */
export interface FleetHooks extends OperatorHooks {
  /** 그 인스턴스에 잡힌 슬롯 — Scaler */
  count(instance: string): number;
  /** 죽은 인스턴스의 사람을 다시 배정한다 — Recoverer(흐름 12 의 4 · 5) */
  move(instance: string, run: string): Promise<void>;
  /** 그 인스턴스의 사람을 다른 인스턴스로 — 비움(흐름 6 의 drain · 7 의 2 ⇒ 흐름 10) */
  drain(instance: string, run: string): Promise<number>;
  /** NodeRpc handoff — 호스트의 떠남 줄(흐름 10) */
  handoff(instance: string, character: string, to: string, run: string): void;
  /** 노드의 보고 — 로드된 캐릭터들을 세션과 맞춘다(흐름 5 의 9 · 13 의 5) */
  reconcile(node: string, instances: readonly { readonly name: string; readonly loaded: readonly string[] }[], run: string): void;
  /** 컨트롤 플레인의 Clock 가운데 세션의 단계(흐름 5 의 11 · 13 · 14) */
  tick(run: string): Promise<void>;
  /** Directory.sweep — 하루에 한 번(흐름 5 의 15). 지운 수 */
  sweep(run: string): Promise<number>;
}

/** 컨트롤 플레인이 닿는 스토리지. */
export type FleetStorage = Pick<StorageSocket, 'database' | 'snapshots' | 'leases' | 'characters'>;

/** Directory.sweep 의 간격 — 하루. */
const SWEEP_MS = 24 * 3600 * 1000;

export class Fleet implements ControlSocket {
  // 데이터 — 개념들(참조)과 설정
  readonly registry: Registry;
  readonly nodes: Nodes;
  readonly scheduler: Scheduler;
  readonly scaler: Scaler;
  readonly recoverer: Recoverer;
  readonly clock: Clock;
  readonly operator: Operator;
  readonly storage: FleetStorage;
  readonly config: FleetConfig;
  readonly zones: readonly FleetZone[];
  readonly hooks: FleetHooks;
  /** 활성인가 — 흐름 13 의 6 이 켜고 7 이 끈다. 개발의 main 은 Elector 가 잡으면 켠다 */
  active = false;
  /** 컨트롤 플레인이 내려가는 가운데 — 새로 띄우지 않는다(흐름 7) */
  closing = false;
  ticks = 0;
  /** 인스턴스마다 마지막 보고 — 사람 수 · 지연 · 쉰 수 · 로드된 캐릭터 */
  readonly seen = new Map<string, InstanceReport>();
  /** 흔적을 남긴다 — 앱이 준 Monitor.trace(흐름 14). */
  readonly trace: TraceFn;
  readonly log: (line: string) => void;
  private readonly nodeOf: (address: string) => NodeSocket;
  /** 존마다 뜨는 가운데의 launch — 한꺼번에 온 것은 이것을 기다린다 */
  private readonly launching = new Map<string, Promise<boolean>>();
  /** 내리는 가운데의 인스턴스 — 노드가 끝을 알릴 때까지 */
  private readonly settling = new Map<string, { promise: Promise<void>; resolve: () => void }>();
  /** 보고에 잇달아 없던 수 — 둘이면 죽은 것이다(방금 띄운 것과 엇갈린 보고에 속지 않게) */
  private readonly missing = new Map<string, number>();
  /** 내려간다고 알린 노드의 비운 인스턴스 */
  private readonly evacuated = new Set<string>();
  private lastSweep = 0;

  /** 흐름 13 의 3 — 표 `instances` 와 `nodes` 를 읽는다. 일은 활성이 된 뒤에(active). */
  static async open(
    config: FleetConfig,
    zones: readonly FleetZone[],
    storage: FleetStorage,
    hooks: FleetHooks,
    nodeOf: (address: string) => NodeSocket,
    log: (line: string) => void = (l) => console.log(l),
    trace: TraceFn = () => {},
    run: string = freshRun(),
  ): Promise<Fleet> {
    const { registry, skipped } = await Registry.load(storage.database);
    if (skipped.length > 0) log(`fleet 표 instances 의 모양이 아닌 줄을 건너뛴다 — ${skipped.join(' ')}`);
    const nodes = await Nodes.load(storage.database, config.reportLimitMs);
    for (const i of registry.all()) trace({ flow: 13, step: 3, run, unit: i.name, end: 'ok', state: i.state, counts: { epoch: i.epoch } }); // Registry.all — 표의 줄마다
    return new Fleet(config, zones, storage, registry, nodes, hooks, nodeOf, log, trace);
  }

  private constructor(config: FleetConfig, zones: readonly FleetZone[], storage: FleetStorage, registry: Registry, nodes: Nodes, hooks: FleetHooks, nodeOf: (address: string) => NodeSocket, log: (line: string) => void, trace: TraceFn) {
    this.config = config;
    this.zones = zones;
    this.storage = storage;
    this.registry = registry;
    this.nodes = nodes;
    this.hooks = hooks;
    this.nodeOf = nodeOf;
    this.trace = trace;
    this.log = log;
    this.clock = new Clock(config.clockMs);
    this.scheduler = new Scheduler(nodes, registry, config.restartLimit);
    this.scaler = new Scaler(registry, (i) => hooks.count(i), zones, config.idleLimit);
    this.recoverer = new Recoverer(registry, storage.leases, (i, r) => hooks.move(i, r), (zone, name, r) => this.launch(zone, this.buildOf(name), r, name), config.restartLimit, trace, log);
    this.operator = new Operator(this, hooks);
  }

  /** 그 인스턴스의 빌드 — 줄의 것, 없으면 살아 있는 노드의 첫 빌드. */
  private buildOf(name: string): string {
    return this.registry.get(name)?.build ?? this.nodes.live()[0]?.build ?? '-';
  }

  /** start — 컨트롤 플레인의 Clock(흐름 5 의 C)을 돌린다. 일은 활성인 동안만. */
  start(): void {
    this.clock.run(() => this.tick());
  }

  zoneOf(name: string): FleetZone | null {
    return this.zones.find((z) => z.name === name) ?? null;
  }

  /** 그 인스턴스가 있는 노드 — 살아 있지 않으면 null. */
  private nodeOfInstance(name: string): NodeSocket | null {
    const i = this.registry.get(name);
    const node = i === null ? null : this.nodes.get(i.node);
    return node === null ? null : this.nodeOf(node.address);
  }

  /** ready — 그 존의 ready 이고 비우는 가운데가 아니며 노드가 살아 있고 내려가지 않는 인스턴스들과 그 빌드(세션 모듈의 Placer 가 고른다). */
  ready(zone: string): { readonly name: string; readonly build: string }[] {
    if (!this.active) return [];
    return this.registry
      .ready(zone)
      .filter((i) => {
        const n = this.nodes.get(i.node);
        return n !== null && !n.closing;
      })
      .map((i) => ({ name: i.name, build: i.build }));
  }

  /** address — 그 인스턴스의 호스트 주소(내부망 — 노드의 host, 게이트웨이가 잇는다). 떠 있지 않으면 null. 클라이언트에게는 가지 않는다. */
  address(name: string): string | null {
    const i = this.registry.get(name);
    const node = i === null ? null : this.nodes.get(i.node);
    return i === null || node === null || i.state !== 'ready' || i.port === null ? null : `ws://${node.host}:${i.port}`;
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
    if (zone === null || this.closing || !this.active) return false;
    const at = this.scheduler.place(zoneName, build, want);
    this.trace({ flow: 3, step: 10, run, unit: at?.name ?? zoneName, end: at === null ? 'refused' : 'ok' }); // Scheduler.place
    if (at === null) return false;
    const node = this.nodes.get(at.node)!;
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
    let answer: Awaited<ReturnType<NodeSocket['launch']>>;
    try {
      answer = await this.nodeOf(node.address).launch(i.name, i.epoch, { dataset: zone.dataset, npc: zone.npc ?? this.config.npc.bodies }, run); // NodeRpc launch — 노드가 13 ~ 18
    } catch (e) {
      answer = { why: `노드에 닿지 않는다 — ${(e as Error).message}`, refused: false, stopped: false };
    }
    if (!('port' in answer)) {
      i.state = answer.stopped ? 'stopped' : 'failed';
      if (!answer.stopped) i.restarts = answer.refused ? this.config.restartLimit + 1 : i.restarts + 1; // 같은 인자로 다시 띄워도 같다
      await this.registry.put(i).catch(() => {});
      this.trace({ flow: 3, step: 12, run, unit: i.name, end: 'failed', state: i.state, counts: { restarts: i.restarts } }); // Runner.start
      throw new Error(answer.stopped ? '뜨는 가운데 내렸다' : answer.why);
    }
    this.trace({ flow: 3, step: 12, run, unit: i.name, end: 'ok' }); // Runner.start
    i.port = answer.port;
    i.state = 'ready';
    i.restarts = 0;
    this.missing.delete(i.name);
    await this.registry.put(i).catch((e: unknown) => this.log(`${i.name} fleet 줄을 적지 못했다 — ${(e as Error).message}`));
    this.trace({ flow: 3, step: 19, run, unit: i.name, end: 'ok', state: 'ready', counts: { port: answer.port, players: 0, epoch: i.epoch } }); // Registry.put
    return true;
  }

  /** load — NodeRpc load(Loader.load — 흐름 9 의 5 ~ 7). 세션 모듈이 부른다. */
  async load(instance: string, character: string, spot: string | null, run: string): Promise<string | null> {
    const node = this.nodeOfInstance(instance);
    if (node === null) return `인스턴스의 노드가 없다 — ${instance}`;
    try {
      return await node.load(instance, character, spot, run);
    } catch (e) {
      return `노드에 닿지 않는다 — ${(e as Error).message}`;
    }
  }

  /** unload — NodeRpc unload(Loader.unload — 흐름 10 의 5 ~ 7). */
  async unload(instance: string, character: string, run: string): Promise<string | null> {
    const node = this.nodeOfInstance(instance);
    if (node === null) return null; // 노드가 없다 — 값은 마지막으로 저장한 것(그 노드의 lease 는 흐름 12 가 끊는다)
    try {
      return await node.unload(instance, character, run);
    } catch (e) {
      return `노드에 닿지 않는다 — ${(e as Error).message}`;
    }
  }

  /** command — NodeRpc command(운영자의 host). 노드가 없거나 답이 없으면 null. */
  async command(instance: string, line: string, run: string): Promise<string | null> {
    const node = this.nodeOfInstance(instance);
    if (node === null) return null;
    try {
      return await node.command(instance, line, run);
    } catch {
      return null;
    }
  }

  /** register — NodeRpc register(흐름 1 의 11 · 13 의 4 — Nodes.register). */
  register(hello: NodeHello, run: string): void {
    const n = this.nodes.register(hello);
    this.trace({ flow: 1, step: 11, run, unit: n.name, end: 'ok', counts: { slots: n.slots } }); // Nodes.register
    if (!this.active) this.trace({ flow: 13, step: 4, run, unit: n.name, end: 'ok' }); // Nodes.register — 표가 서는 가운데 알렸다
  }

  /**
   * report — NodeRpc report(흐름 5 의 7 — Nodes.heartbeat). 보고와 표를 맞춘다 — 표에 없는(또는 세대가 다른) 인스턴스는 내리게 하고,
   * 표에서는 그 노드에서 도는데 보고에 잇달아 없는 인스턴스는 죽은 것이다(⇒ 흐름 12). 로드된 캐릭터는 세션 모듈이 맞춘다(5 의 9).
   * 노드가 내려간다고 알렸으면 그 노드의 사람을 다른 노드로 옮기게 한다(흐름 7 의 2).
   */
  report(report: NodeReport, run: string): void {
    if (this.nodes.get(report.name) === null) this.trace({ flow: 13, step: 4, run, unit: report.name, end: 'ok' }); // Nodes.register — 새 활성에 다시 알렸다(보고의 알림으로)
    const node = this.nodes.heartbeat(report);
    for (const r of report.instances) this.seen.set(r.name, r);
    this.trace({ flow: 5, step: 7, run, unit: node.name, end: 'ok', counts: { instances: report.instances.length, closing: report.closing ? 1 : 0 } }); // Nodes.heartbeat
    this.hooks.reconcile(node.name, report.instances, run); // Reconciler.match — 흔적은 세션 모듈이
    if (!this.active) return; // 표가 서는 가운데 — 고치지 않는다(흐름 13 의 6)
    const here = new Set(report.instances.map((r) => r.name));
    for (const r of report.instances) {
      const i = this.registry.get(r.name);
      if (i !== null && i.node === node.name && i.epoch === r.epoch) continue;
      this.log(`${r.name} fleet 표에 없는 인스턴스가 ${node.name} 에서 돈다 — 내리게 한다`);
      void this.nodeOf(node.address).stop(r.name, run).catch(() => {}); // 표에 없는 인스턴스는 내리게 한다
    }
    for (const i of this.registry.all()) {
      if (i.node !== node.name || i.state !== 'ready') continue;
      if (here.has(i.name)) {
        this.missing.delete(i.name);
        continue;
      }
      const n = (this.missing.get(i.name) ?? 0) + 1;
      this.missing.set(i.name, n);
      if (n >= 2) {
        this.missing.delete(i.name);
        void this.recoverer.recover(i.name, i.epoch, `${node.name} 의 보고에 없다`, run); // ⇒ 흐름 12
      }
    }
    if (report.closing) {
      for (const r of report.instances) {
        if (r.loaded.length === 0 || this.evacuated.has(`${r.name}@${r.epoch}`)) continue;
        this.evacuated.add(`${r.name}@${r.epoch}`);
        this.trace({ flow: 7, step: 2, run, unit: r.name, end: 'ok', counts: { loaded: r.loaded.length } }); // Mover.move — 그 노드의 사람을 다른 노드로
        void this.registry.drain(r.name, true).then(() => this.hooks.drain(r.name, run)); // ⇒ 흐름 10
      }
    }
  }

  /** handoff — NodeRpc handoff(호스트의 떠남 줄 ⇒ 흐름 10). */
  handoff(instance: string, character: string, to: string, run: string): void {
    if (this.active) this.hooks.handoff(instance, character, to, run);
  }

  /** exited — NodeRpc exited(흐름 4 의 5). 내림이면 줄을 stopped 로(흐름 7 의 6), 아니면 흐름 12. */
  exited(name: string, epoch: number, code: number, stopped: boolean, run: string): void {
    this.seen.delete(name);
    this.missing.delete(name);
    const i = this.registry.get(name);
    const settle = (): void => {
      const s = this.settling.get(name);
      this.settling.delete(name);
      s?.resolve();
    };
    if (!stopped) {
      settle();
      void this.recoverer.recover(name, epoch, `exit ${code}`, run);
      return;
    }
    if (i === null || i.epoch !== epoch) return settle();
    i.state = 'stopped';
    i.port = null;
    i.draining = false;
    this.registry.put(i).then(
      () => this.trace({ flow: 7, step: 6, run, unit: name, end: 'ok', state: 'stopped', counts: { players: 0 } }), // Registry.put
      () => this.trace({ flow: 7, step: 6, run, unit: name, end: 'failed', state: 'stopped' }),
    ).finally(settle);
  }

  /**
   * tick — 컨트롤 플레인의 Clock(흐름 5 의 C). 보고가 끊긴 노드의 인스턴스는 죽은 것이고(10 ⇒ 흐름 12), 세션의 단계(11 · 13 · 14)를 하고,
   * 존마다 예비 용량을 맞추고(12), 하루에 한 번 계정을 청소한다(15). 활성이 아니면 하지 않는다.
   */
  async tick(): Promise<void> {
    if (!this.active) return;
    this.ticks++;
    const run = freshRun();
    const all = this.nodes.list().length;
    const dead = this.nodes.dead();
    if (dead.length > 0 && all > 1 && dead.length * 2 > all) {
      // 노드의 큰 몫이 한꺼번에 끊겨 보인다 — 컨트롤 플레인 쪽 망을 의심한다. 죽음의 판정은 운영자가 한다(forget)
      for (const n of dead) this.nodes.register({ name: n.name, address: n.address, host: n.host, build: n.build, slots: n.slots });
      this.trace({ flow: 5, step: 10, run, unit: '-', end: 'refused', counts: { dead: dead.length, nodes: all } });
      this.log(`fleet 노드 ${dead.length} / ${all} 이 한꺼번에 끊겨 보인다 — 죽음을 판정하지 않는다(운영자: forget <node>)`);
    } else {
      for (const n of dead) {
        this.trace({ flow: 5, step: 10, run, unit: n.name, end: 'ok' }); // Nodes.dead ⇒ 흐름 12
        await this.forgetNode(n.name, run);
      }
    }
    await this.hooks.tick(run); // 세션의 11 · 13 · 14 — 흔적은 세션 모듈이
    const plan = this.scaler.balance((name) => (this.hooks.count(name) === 0 ? (this.seen.get(name)?.idle ?? 0) : 0));
    for (const zone of plan.launch) {
      this.trace({ flow: 5, step: 12, run, unit: zone, end: 'ok', counts: { launch: 1 } }); // Scaler.balance — 예비 용량이 모자라다 ⇒ 흐름 3 의 B
      const build = this.nodes.live()[0]?.build;
      if (build !== undefined) void this.launch(zone, build, run).catch((e: unknown) => this.log(`${zone} fleet 예비 인스턴스를 띄우지 못했다 — ${(e as Error).message}`));
    }
    for (const s of plan.stop) {
      this.trace({ flow: 5, step: 12, run, unit: s.name, end: 'ok', counts: s.why === 'idle' ? { idle: this.seen.get(s.name)?.idle ?? 0 } : { drained: 1 } }); // Scaler.balance ⇒ 흐름 7 의 3 ~ 6
      this.log(`${s.name} fleet ${s.why === 'idle' ? '사람 없이 쉬었다' : '다 비웠다'} — 내린다`);
      void this.stop(s.name, run);
    }
    if (Date.now() - this.lastSweep >= SWEEP_MS) {
      this.lastSweep = Date.now();
      await this.hooks.sweep(run).catch((e: unknown) => this.log(`fleet 계정을 청소하지 못했다 — ${(e as Error).message}`)); // Directory.sweep — 흔적은 앱이
    }
  }

  /** forgetNode — 그 노드를 죽은 것으로 — 그 노드의 인스턴스마다 흐름 12(보고가 끊겼다 · 운영자의 forget). 수습한 수. */
  async forgetNode(name: string, run: string): Promise<number> {
    this.nodes.forget(name);
    const mine = this.registry.all().filter((i) => i.node === name && (i.state === 'ready' || i.state === 'starting' || i.state === 'stopping'));
    for (const i of mine) await this.recoverer.recover(i.name, i.epoch, `노드 ${name} 가 끊겼다`, run);
    return mine.length;
  }

  /** reload — 흐름 13 의 3. 자리를 잡았다 — 표 `instances` · `nodes` 를 다시 읽는다. 표가 설 때까지(settle) 일하지 않는다. */
  async reload(run: string): Promise<void> {
    this.active = false;
    this.seen.clear();
    this.missing.clear();
    await this.registry.reload();
    await this.nodes.reload();
    for (const i of this.registry.all()) this.trace({ flow: 13, step: 3, run, unit: i.name, end: 'ok', state: i.state, counts: { epoch: i.epoch } }); // Registry.all
  }

  /** settled — 표가 섰는가: 줄에서 도는 인스턴스의 노드가 다 알렸고 보고가 왔다(흐름 13 의 6). */
  settled(): boolean {
    const running = this.registry.all().filter((i) => i.state === 'ready' || i.state === 'starting' || i.state === 'stopping');
    return running.every((i) => this.nodes.get(i.node)?.report != null) && this.nodes.list().every((n) => n.report !== null);
  }

  /** standby — 흐름 13 의 7. 자리를 잃었다 — 일을 멈추고 표를 버린다. */
  standby(): void {
    this.active = false;
    this.seen.clear();
    this.missing.clear();
    this.nodes.rows.clear();
  }

  /**
   * settle — 흐름 13 의 6. 표가 섰다 — 줄에서는 도는데 그 노드가 알리지 않은 인스턴스는 죽은 것이다(⇒ 흐름 12). 그 뒤로 일한다(active).
   * 알린 노드의 보고에 없는 것은 보고를 맞추는 길(report)이 센다.
   */
  async settle(run: string): Promise<void> {
    this.active = true;
    for (const i of this.registry.all()) {
      if ((i.state !== 'ready' && i.state !== 'starting' && i.state !== 'stopping') || this.nodes.get(i.node) !== null) continue;
      await this.recoverer.recover(i.name, i.epoch, `노드 ${i.node} 가 알리지 않았다`, run);
    }
  }

  /**
   * stop — 흐름 7 의 3 ~ 6. 노드가 남은 값을 내려 저장하고 호스트를 내리고 Store 를 올린다(NodeRpc stop — 3 ~ 5). 노드가 끝을 알리면 줄을 stopped 로(6).
   * 사람을 옮기지 않는다. 노드가 끝을 알릴 때까지 기다린다(한계 stopLimitMs × 3). 두 번 불려도 한 번.
   */
  async stop(name: string, run: string = freshRun()): Promise<void> {
    const was = this.settling.get(name);
    if (was !== undefined) return was.promise;
    const i = this.registry.get(name);
    const node = this.nodeOfInstance(name);
    if (i === null || node === null || i.state === 'stopped' || i.state === 'failed') return;
    let resolve!: () => void;
    const promise = new Promise<void>((r) => (resolve = r));
    this.settling.set(name, { promise, resolve });
    const starting = i.state === 'starting';
    if (i.state === 'ready') {
      i.state = 'stopping';
      await this.registry.put(i).catch(() => {});
    }
    const limit = setTimeout(() => this.settling.get(name)?.resolve(), this.config.stopLimitMs * 3);
    try {
      await node.stop(name, run); // NodeRpc stop — 노드가 3 ~ 5 를 하고 exited 로 알린다
    } catch (e) {
      this.log(`${name} fleet 노드에 닿지 않는다 — ${(e as Error).message}`);
    }
    if (starting) {
      const job = this.launching.get(i.zone);
      if (job !== undefined) await job.catch(() => false); // 뜨는 가운데 — launch 가 stopped 로 그만둔다
      this.settling.delete(name);
      resolve();
    }
    await promise;
    clearTimeout(limit);
  }

  /** close — 컨트롤 플레인이 내려간다(흐름 7). Clock 을 멈추고 새로 띄우지 않는다. 도는 인스턴스에 닿지 않는다(흐름 7 의 규칙). */
  close(): void {
    this.closing = true;
    this.active = false;
    this.clock.stop();
  }
}
