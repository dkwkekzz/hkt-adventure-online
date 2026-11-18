// Service — 서비스 프로세스의 조립 (design/README.md 의 Service). start 는 흐름 1, stop 은 흐름 7. 두 번 불려도 한 번.
// role 마다 그 role 의 개념을 세운다 — api(Api · Static · 계정) · gateway(게이트웨이) · control(세션 · 플릿의 컨트롤 플레인 · Operator · Elector) · node(플릿의 노드).
// main 은 넷을 한 프로세스에 조립한 것이다 — SessionRpc · NodeRpc 가 함수 부름이 될 뿐 흐름은 같다. 갈린 role 사이는 내부망의 글(rpc.ts)이다.
// Monitor(흐름 14)를 먼저 세우고 그 trace 를 개념들에 준다 — 흐름 1 의 단계부터 흔적이 남는다.

import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Banlist, Characters, Directory, Signer, kindOf } from '../../account';
import { Fleet } from '../../fleet';
import { NodeAgent, bundleViewer } from '../../node';
import type { FleetHooks, OperatorHooks } from '../../fleet';
import { openGateway } from '../../gateway';
import { openSession } from '../../session';
import { openStorage } from '../../storage';
import type { GatewaySocket } from '../../protocol/gateway';
import type { ControlSocket, LaunchSpec, Launched, NodeHello, NodeReport, NodeSocket } from '../../protocol/node';
import type { TraceFn } from '../../protocol/observe';
import { OPERATOR_HEAD } from '../../protocol/operator';
import type { Attached, Entered, GateReport, SessionSocket, Unattached, Waiting } from '../../protocol/session';
import type { StorageSocket } from '../../protocol/storage';
import { openApi } from './api';
import type { ServiceConfig } from './config';
import { Elector } from './elector';
import { readMap } from './map';
import { Monitor } from './monitor';
import { RpcError, call, listen, serveRpc } from './rpc';
import type { RpcMeta } from './rpc';
import { Static } from './static';

/** 이 파일에서 src 와 design 의 자리 — 흐름의 지도는 저장소의 design/01-flows 에서 뽑는다. */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESIGN = join(SRC, '..', 'design');
const freshRun = (): string => randomBytes(4).toString('hex');
const has = (role: ServiceConfig['role'], ...want: ServiceConfig['role'][]): boolean => role === 'main' || want.includes(role);

/**
 * 활성 컨트롤 플레인으로 가는 글 — 자리(LeaderLock.holder)에서 주소를 찾아 보낸다. 닿지 않거나 대기면(503) 한 번 다시 찾아 보낸다.
 * 컨트롤 플레인이 없는 동안의 글은 실패다 — 그 흐름의 「실패하면」(입장은 503, 보고는 다음 간격이 다시).
 */
class ToControl {
  private address: string | null = null;
  constructor(
    private readonly storage: StorageSocket,
    private readonly limitMs: number,
  ) {}

  private async find(fresh: boolean): Promise<string> {
    if (!fresh && this.address !== null) return this.address;
    const h = await this.storage.leader.holder();
    if (h === null) throw new RpcError(503, '활성 컨트롤 플레인이 없다');
    this.address = h.holder;
    return h.holder;
  }

  async send(name: string, args: readonly unknown[], run: string): Promise<unknown> {
    try {
      return await call(await this.find(false), name, args, { run, term: 0 }, this.limitMs);
    } catch (e) {
      if (!(e instanceof RpcError) || (e.code !== 0 && e.code !== 503)) throw e;
      return call(await this.find(true), name, args, { run, term: 0 }, this.limitMs);
    }
  }

  private readonly pending = new Set<Promise<unknown>>();

  /** 답을 기다리지 않는 글 — 실패는 기록만(다음 보고가 바로잡는다). */
  post(name: string, args: readonly unknown[], run: string, log: (line: string) => void): void {
    const p = this.send(name, args, run)
      .catch((e: unknown) => log(`rpc ${name} 을 보내지 못했다 — ${(e as Error).message}`))
      .finally(() => this.pending.delete(p));
    this.pending.add(p);
  }

  /** 보낸 글이 다 닿을 때까지 — 내려가는 노드의 마지막 exited 가 프로세스와 함께 사라지지 않게(흐름 7 의 6). */
  async flush(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }
}

/** 받는 쪽이 본 term — 그보다 작은 term 의 컨트롤 플레인의 글은 버린다(흐름 13 — 활성이 둘인 때가 없다). */
class TermGuard {
  seen = 0;
  check(meta: RpcMeta): { code: 409; why: string } | null {
    if (meta.term < this.seen) return { code: 409, why: `낡은 term ${meta.term} < ${this.seen}` };
    this.seen = meta.term;
    return null;
  }
}

export class Service {
  // 데이터 — config(불변) · role · monitor · storage 와 그 role 의 개념들(참조). 없는 role 의 것은 null
  readonly config: ServiceConfig;
  readonly role: ServiceConfig['role'];
  readonly monitor: Monitor;
  readonly storage: StorageSocket;
  readonly signer: Signer;
  readonly directory: Directory | null = null;
  readonly characters: Characters | null = null;
  readonly banlist: Banlist | null = null;
  /** 컨트롤 플레인의 플릿(Registry · Nodes · …) */
  readonly fleet: Fleet | null = null;
  /** 이 서버의 노드 */
  readonly node: NodeAgent | null = null;
  /** 세션 — 컨트롤 플레인에서는 SessionRpc 의 받는 쪽 */
  readonly session: SessionSocket | null = null;
  readonly api: Server | null = null;
  readonly gateway: GatewaySocket | null = null;
  readonly elector: Elector | null = null;
  /** 운영자의 콘솔 토큰 — stdin 의 글을 이 토큰으로(OPERATOR_KEY 가 있을 때) */
  readonly console: string | null = null;
  /** 내부망의 http — role 마다 하나 */
  readonly servers: Server[] = [];
  port = 0;
  private stopping: Promise<void> | null = null;
  private readonly log: (line: string) => void;
  /** 활성 컨트롤 플레인으로 가는 글(api · gateway · node) */
  private readonly toControl: ToControl | null;

  private constructor(config: ServiceConfig, monitor: Monitor, storage: StorageSocket, signer: Signer, log: (line: string) => void, toControl: ToControl | null, parts: Partial<Service>) {
    this.config = config;
    this.toControl = toControl;
    this.role = config.role;
    this.monitor = monitor;
    this.storage = storage;
    this.signer = signer;
    this.log = log;
    Object.assign(this, parts);
  }

  /**
   * start — 흐름 1. 키가 없으면 시작 거부. Monitor 를 열고(가장 먼저), 스토리지에 닿고, 그 role 의 개념을 세우고 듣는다. 엔진 프로세스는 띄우지 않는다.
   * operatorKey 는 OPERATOR_KEY — 컨트롤 플레인만 든다. 없으면 운영자의 명령을 받지 않는다(흐름 6 의 2).
   */
  static async start(config: ServiceConfig, key: string | undefined, log: (line: string) => void = (l) => console.log(l), operatorKey?: string): Promise<Service> {
    if (key === undefined || key === '') throw new Error('HOST_AUTH_KEY 가 없다 — 토큰 없는 서비스는 열지 않는다');
    const run = freshRun();
    const role = config.role;
    const monitor = new Monitor({ role, build: config.build, map: readMap(DESIGN, SRC), traceKeep: config.traceKeep, every: config.fleet.clockMs, key });
    await monitor.listen(config.monitorPort);
    const trace: TraceFn = monitor.trace;
    const servers: Server[] = [];
    let storage: StorageSocket | null = null;
    let session: SessionSocket | null = null;
    let fleet: Fleet | null = null;
    let node: NodeAgent | null = null;
    let elector: Elector | null = null;
    let gateway: GatewaySocket | null = null;
    try {
      storage = await openStorage(config.storage); // 흐름 1 의 1 — 닿지 않으면 시작 거부
      const store = storage;
      trace({ flow: 1, step: 1, run, unit: '-', end: 'ok' }); // Service.start
      log(`service ${role} · 스토리지 — ${store.where}`);
      const signer = new Signer(key, config.tokenTtl);
      const parts: Partial<Service> = { servers };
      const rpcAt = (port: number): string => `http://${config.rpc.host}:${port}`;
      const toControl = role === 'main' || role === 'control' ? null : new ToControl(store, config.rpc.limitMs);

      // ── 컨트롤 플레인 — 세션 · 플릿(표 · 고르기) · Operator · Elector ──────────────────────
      let directory: Directory | null = null;
      let characters: Characters | null = null;
      let banlist: Banlist | null = null;
      if (has(role, 'api', 'control')) {
        directory = new Directory(store.database);
        characters = new Characters(store.database, config.characterLimit);
        banlist = new Banlist(store.database);
        Object.assign(parts, { directory, characters, banlist });
      }
      /** 게이트웨이의 이름 → 내부 주소(그 게이트웨이의 보고가 싣는다). main 에서는 같은 프로세스의 게이트웨이 */
      const gates = new Map<string, string>();
      if (has(role, 'control')) {
        const opSigner = operatorKey === undefined || operatorKey === '' ? null : new Signer(operatorKey, 12 * 3600);
        const opHooks: OperatorHooks = {
          verify: (token) => {
            const id = opSigner?.verify(token) ?? null;
            if (id === null || kindOf(id) !== 'operator') return null;
            const name = id.slice(OPERATOR_HEAD.length);
            return config.operators.includes(name) ? name : null;
          },
          closeZone: (zone) => session!.closeZone(zone),
          openZone: (zone) => session!.openZone(zone),
          kick: (character, r) => session!.kick(character, r),
          ban: async (account, until, r) => {
            await banlist!.ban(account, until);
            await session!.evict(account, r); // 차단하면 그 계정의 세션도 내보낸다
          },
          unban: (account) => banlist!.unban(account),
          playing: (character) => session!.playing(character),
        };
        const hooks: FleetHooks = {
          ...opHooks,
          count: (instance) => session?.count(instance) ?? 0, // Scaler
          move: async (instance, r) => await session?.recover(instance, r), // Recoverer ⇒ 흐름 12 의 4 · 5
          drain: async (instance, r) => (await session?.drain(instance, r)) ?? 0, // 비움 ⇒ 흐름 10
          handoff: (instance, character, to, r) => session?.handoff(instance, character, to, r), // NodeRpc handoff ⇒ 흐름 10
          reconcile: (n, instances, r) => session?.reconcile(n, instances, r), // Reconciler.match(흐름 5 의 9)
          tick: async (r) => await session?.tick(r), // 세션의 11 · 13 · 14
          sweep: async (r) => {
            const removed = await directory!.sweep(Date.now() - config.accountIdleMs);
            trace({ flow: 5, step: 15, run: r, unit: '-', end: 'ok', counts: { removed } }); // Directory.sweep
            return removed;
          },
        };
        const nodeOf = (address: string): NodeSocket => {
          if (role === 'main') return node!; // 같은 프로세스의 노드
          const meta = (r: string): RpcMeta => ({ run: r, term: elector?.term ?? 0 });
          const limit = config.rpc.limitMs;
          return {
            launch: async (instance, epoch, spec: LaunchSpec, r) => (await call(address, 'launch', [instance, epoch, spec], meta(r), config.fleet.startLimitMs + limit)) as Launched,
            stop: async (instance, r) => void (await call(address, 'stop', [instance], meta(r), config.fleet.stopLimitMs * 3 + limit)),
            command: async (instance, line, r) => (await call(address, 'command', [instance, line], meta(r), config.fleet.commandLimitMs + limit)) as string | null,
            load: async (instance, c, spot, r) => (await call(address, 'load', [instance, c, spot], meta(r), limit)) as string | null,
            unload: async (instance, c, r) => (await call(address, 'unload', [instance, c], meta(r), limit)) as string | null,
          };
        };
        fleet = await Fleet.open(config.fleet, config.zones, store, hooks, nodeOf, log, trace, run); // 흐름 13 의 3 — 표를 읽는다
        const f = fleet;
        const toGate = (gate: string, name: string, args: readonly unknown[], r: string): void => {
          if (role === 'main') return; // main 의 게이트웨이는 아래에서 함수로
          const at = gates.get(gate);
          if (at === undefined) return log(`rpc 모르는 게이트웨이 — ${gate}`);
          void call(at, name, args, { run: r, term: elector?.term ?? 0 }, config.rpc.limitMs).catch((e: unknown) => log(`rpc ${name} → ${gate} 을 보내지 못했다 — ${(e as Error).message}`));
        };
        session = await openSession({
          config: config.session,
          zones: config.zones.map((z) => ({ name: z.name, dataset: z.dataset, capacity: z.capacity, spare: z.spare })),
          entry: config.zones[0]!.name,
          database: store.database,
          characters: store.characters,
          owner: (character) => characters!.owner(character),
          banned: (account) => banlist!.banned(account),
          remove: (character) => characters!.remove(character),
          ready: (zone) => f.ready(zone), // 빌드는 인스턴스의 것(노드마다)
          launch: (zone, build, r) => f.launch(zone, build, r),
          address: (instance) => f.address(instance),
          load: (instance, character, spot, r) => f.load(instance, character, spot, r), // NodeRpc load
          unload: (instance, character, r) => f.unload(instance, character, r), // NodeRpc unload
          issue: (character) => signer.issue(character, config.agentTtl), // 호스트에 줄 토큰 — 접속 한 번에만 쓴다
          kick: (g, character, code, r) => (role === 'main' ? gateway?.kick(character, code, r) : toGate(g, 'kick', [character, code], r)),
          reroute: (g, character, to, r) => (role === 'main' ? gateway?.reroute(character, to, r) : toGate(g, 'reroute', [character, to], r)),
          trace,
          log,
        });
        const s = session;
        const holder = role === 'main' ? `main:${process.pid}` : rpcAt(config.rpc.controlPort);
        elector = new Elector(
          store.leader,
          holder,
          config.leader.ttlMs,
          config.leader.settleMs,
          {
            settling: async (_term, r) => {
              s.settle(true); // 표를 버리고 보고에서 다시 세운다(흐름 13 의 5)
              await f.reload(r); // 흐름 13 의 3
            },
            settled: () => f.settled(),
            active: async (r) => {
              s.settle(false);
              await f.settle(r); // 흐름 13 의 6 — 알리지 않은 노드의 인스턴스는 흐름 12
            },
            standby: async () => {
              f.standby(); // 흐름 13 의 7 — 표를 버린다
              s.settle(true);
            },
          },
          trace,
          log,
        );
        if (opSigner !== null && config.operators.length > 0) Object.assign(parts, { console: opSigner.issue(`${OPERATOR_HEAD}${config.operators[0]}`, 365 * 24 * 3600) });
        else log('service OPERATOR_KEY 가 없다 — 운영자의 명령은 받지 않는다(흐름 6 의 2)');
        if (role === 'control') {
          const ctl = elector;
          const ready = (name: string): { code: 503; why: string } | null => (ctl.role === 'standby' ? { code: 503, why: `대기의 컨트롤 플레인이다 — ${name}` } : null);
          const server = serveRpc(
            {
              // SessionRpc — API 서버 · 게이트웨이 → 컨트롤 플레인
              enter: (a, m) => s.enter(a[0] as string, a[1] as string, m.run),
              forget: (a, m) => s.forget(a[0] as string, a[1] as string, m.run),
              attach: (a, m) => s.attach(a[0] as string, a[1] as string, m.run),
              detach: (a, m) => s.detach(a[0] as string, a[1] as string, m.run),
              report: (a, m) => {
                const r = a[0] as GateReport;
                gates.set(r.name, a[1] as string);
                s.report(r, m.run);
              },
              // NodeRpc — 노드 → 컨트롤 플레인
              register: (a, m) => f.register(a[0] as NodeHello, m.run),
              nodeReport: (a, m) => f.report(a[0] as NodeReport, m.run),
              handoff: (a, m) => f.handoff(a[0] as string, a[1] as string, a[2] as string, m.run),
              exited: (a, m) => f.exited(a[0] as string, a[1] as number, a[2] as number, a[3] as boolean, m.run),
            },
            (name) => ready(name),
            (token, line) => (ctl.role === 'standby' ? Promise.resolve('대기의 컨트롤 플레인이다 — 활성에게') : f.operator.command(token, line)),
          );
          await listen(server, config.rpc.controlPort);
          servers.push(server);
        }
        Object.assign(parts, { fleet, session, elector });
      }

      // ── 노드 — 이 서버의 인스턴스 ──────────────────────────────────────────────
      if (has(role, 'node')) {
        const control: ControlSocket =
          role === 'main'
            ? fleet!
            : {
                register: (hello, r) => toControl!.post('register', [hello], r, log),
                report: (report, r) => toControl!.post('nodeReport', [report], r, log),
                handoff: (i, c, to, r) => toControl!.post('handoff', [i, c, to], r, log),
                exited: (i, epoch, code, stopped, r) => toControl!.post('exited', [i, epoch, code, stopped], r, log),
              };
        node = new NodeAgent(
          {
            engineDir: config.fleet.engineDir,
            party: config.fleet.party,
            beat: config.fleet.beat,
            sparse: config.fleet.sparse,
            npcAccount: config.fleet.npc.account,
            ports: config.fleet.ports,
            node: { name: config.fleet.node.name, slots: config.fleet.node.slots, host: config.fleet.hostName, address: role === 'main' ? 'main' : rpcAt(config.rpc.nodePort) },
            spool: config.fleet.spool,
            clockMs: config.fleet.clockMs,
            startLimitMs: config.fleet.startLimitMs,
            stopLimitMs: config.fleet.stopLimitMs,
            commandLimitMs: config.fleet.commandLimitMs,
            restartLimit: config.fleet.restartLimit,
            backupEvery: config.fleet.backupEvery,
            backupKeep: config.fleet.backupKeep,
            closingMs: config.fleet.closingMs,
          },
          config.build,
          store,
          key,
          (account) => signer.issue(account, config.agentTtl),
          control,
          log,
          trace,
        );
        if (role === 'node') {
          const n = node;
          const terms = new TermGuard();
          const server = serveRpc(
            {
              launch: (a, m) => n.launch(a[0] as string, a[1] as number, a[2] as LaunchSpec, m.run),
              stop: (a, m) => n.stop(a[0] as string, m.run),
              command: (a, m) => n.command(a[0] as string, a[1] as string, m.run),
              load: (a, m) => n.load(a[0] as string, a[1] as string, a[2] as string | null, m.run),
              unload: (a, m) => n.unload(a[0] as string, a[1] as string, m.run),
            },
            (_name, meta) => terms.check(meta),
          );
          await listen(server, config.rpc.nodePort);
          servers.push(server);
        }
        await node.start(run); // 흐름 1 의 7 ~ 10 — 엔진 체크아웃이 없으면 시작 거부
        Object.assign(parts, { node });
      }

      // ── 게이트웨이 ───────────────────────────────────────────────────────────
      if (has(role, 'gateway')) {
        const gateRpc = role === 'main' ? '' : rpcAt(config.rpc.gatewayPort);
        gateway = openGateway({
          config: config.gateway,
          name: role === 'main' ? 'gate-1' : `gate-${config.rpc.host}-${config.rpc.gatewayPort}`,
          address: config.gateUrl,
          clockMs: config.fleet.clockMs,
          verify: (token) => {
            const id = signer.verify(token);
            return id !== null && kindOf(id) === 'character' ? id : null; // 캐릭터의 토큰만
          },
          attach:
            role === 'main'
              ? (character, gate, r) => session!.attach(character, gate, r)
              : async (character, gate, r): Promise<Attached | Unattached> => {
                  try {
                    return (await toControl!.send('attach', [character, gate], r)) as Attached | Unattached;
                  } catch (e) {
                    return { why: `컨트롤 플레인에 닿지 않는다 — ${(e as Error).message}`, busy: true };
                  }
                },
          detach: role === 'main' ? (character, gate, r) => session!.detach(character, gate, r) : (character, gate, r) => toControl!.post('detach', [character, gate], r, log),
          report: role === 'main' ? (report, r) => session!.report(report, r) : (report, r) => toControl!.post('report', [report, gateRpc], r, log),
          trace,
          log,
        });
        if (role === 'gateway') {
          const g = gateway;
          const terms = new TermGuard();
          const server = serveRpc(
            {
              kick: (a, m) => g.kick(a[0] as string, a[1] as number, m.run),
              reroute: (a, m) => g.reroute(a[0] as string, a[1] as Attached, m.run),
            },
            (_name, meta) => terms.check(meta),
          );
          await listen(server, config.rpc.gatewayPort);
          servers.push(server);
        }
        await gateway.listen(run); // 흐름 1 의 4 · 5
        Object.assign(parts, { gateway });
      }

      // ── API 서버 ──────────────────────────────────────────────────────────────
      let apiServer: Server | null = null;
      if (has(role, 'api')) {
        await bundleViewer(config.fleet.engineDir, config.fleet.viewerOut, trace, run, log); // 흐름 1 의 2
        const files = new Static(config.fleet.engineDir, config.fleet.viewerOut, config.keymap, config.scheme);
        // Keymap 을 찾지 못하면 뷰어는 단축키 없이 메뉴로만 고른다 — 엔진을 올려 자리가 바뀌어도 조용히 지나가지 않게 알린다
        if (config.keymap !== null && files.keymapFile() === null) log(`service Keymap 이 없다 — ${files.keymap}${config.scheme === null ? '' : ` (조작 틀 ${config.scheme})`}. 뷰어는 메뉴로만 고른다`);
        const sessionRpc =
          role === 'main'
            ? session!
            : {
                enter: async (character: string, build: string, r: string): Promise<Entered | Waiting | Unattached> => {
                  try {
                    return (await toControl!.send('enter', [character, build], r)) as Entered | Waiting | Unattached;
                  } catch (e) {
                    return { why: `컨트롤 플레인에 닿지 않는다 — ${(e as Error).message}`, busy: true };
                  }
                },
                forget: async (account: string, character: string, r: string): Promise<{ forgot: string } | Unattached> => {
                  try {
                    return (await toControl!.send('forget', [account, character], r)) as { forgot: string } | Unattached;
                  } catch (e) {
                    return { why: `컨트롤 플레인에 닿지 않는다 — ${(e as Error).message}`, busy: true };
                  }
                },
              };
        apiServer = openApi({
          directory: directory!,
          characters: characters!,
          banlist: banlist!,
          signer,
          session: sessionRpc,
          build: config.build,
          pageUrl: config.pageUrl,
          characterTtl: config.characterTtl,
          files,
          log,
          trace,
        });
        await new Promise<void>((resolve, reject) => {
          apiServer!.once('error', reject);
          apiServer!.listen(config.apiPort, () => resolve());
        });
        Object.assign(parts, { api: apiServer });
      }

      // ── 컨트롤 플레인이 일을 시작한다 — 흐름 1 의 6 ⇒ 흐름 13 ─────────────────────
      if (elector !== null) {
        await elector.elect(run); // 흐름 13 의 1 · 2 — 잡으면 settling, 표가 섰으면 active
        if (elector.role === 'settling') await elector.elect(run);
        elector.run(freshRun);
        fleet!.start(); // 컨트롤 플레인의 Clock — 흐름 5 의 C(활성인 동안)
        trace({ flow: 1, step: 6, run, unit: '-', end: 'ok', state: elector.role }); // Elector.elect
      }
      const service = new Service(config, monitor, store, signer, log, toControl, parts);
      if (apiServer !== null) {
        const at = apiServer.address();
        service.port = typeof at === 'object' && at !== null ? at.port : config.apiPort;
        trace({ flow: 1, step: 3, run, unit: '-', end: 'wait', counts: { port: service.port } }); // Api.listen — 클라이언트 ◇
      }
      monitor.leader = (): string | null => elector?.role ?? null;
      return service;
    } catch (e) {
      trace({ flow: 1, step: 1, run, unit: '-', end: 'failed' });
      for (const s of servers) s.close();
      await gateway?.close(run).catch(() => {});
      await node?.close(run, false).catch(() => {});
      fleet?.close();
      await elector?.resign(run).catch(() => {});
      await storage?.close().catch(() => {});
      await monitor.close();
      throw e;
    }
  }

  /**
   * stop — 흐름 7. role 마다 — gateway: 알리고 접속을 닫는다(7 · 8). node: 알리고(1), 사람이 옮겨지기를 기다려(2 — 컨트롤 플레인이) 남은 값을 내리고 호스트를 내린다(3 ~ 5).
   * control: 자리를 놓는다(9). api: http 를 닫는다(10). 전부: 스토리지를 닫는다(11). 어느 것도 다른 프로세스를 내리지 않는다.
   * main 은 노드가 하나라 옮길 곳이 없다 — 게이트웨이를 먼저 닫고(사람은 rerouting 없이 닫힘을 받는다) 기다리지 않고 내린다.
   */
  stop(): Promise<void> {
    if (this.stopping !== null) return this.stopping;
    this.monitor.closing = true;
    const run = freshRun();
    this.stopping = (async () => {
      if (this.gateway !== null) await this.gateway.close(run); // 흐름 7 의 7 · 8
      if (this.node !== null) await this.node.close(run, this.role !== 'main'); // 흐름 7 의 1 · 3 ~ 5(main 은 기다리지 않는다) — 그동안 컨트롤 플레인의 글(unload · stop)을 받는다
      if (this.fleet !== null) this.fleet.close();
      this.session?.close();
      if (this.elector !== null) await this.elector.resign(run); // 흐름 7 의 9 — 그 뒤의 글은 대기의 답(503)을 받고 새 활성을 찾는다
      await this.toControl?.flush(); // 노드의 마지막 exited 가 닿게
      for (const s of this.servers) s.close(); // 받은 글의 답은 마저 보낸다 — 쉬는 연결만 닫힌다
      if (this.api !== null) {
        await new Promise<void>((resolve) => this.api!.close(() => resolve()));
        this.api.closeAllConnections();
        this.monitor.trace({ flow: 7, step: 10, run, unit: '-', end: 'ok' }); // Api.close
      }
      let closed: 'ok' | 'failed' = 'ok';
      await this.storage.close().catch(() => (closed = 'failed'));
      this.monitor.trace({ flow: 7, step: 11, run, unit: '-', end: closed }); // 스토리지를 닫는다 — 다른 개념이 다 내려간 뒤
      await this.monitor.close();
    })();
    return this.stopping;
  }
}
