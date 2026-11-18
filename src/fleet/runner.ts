// Runner — 인스턴스 하나의 프로세스를 띄우고 내린다 (design/02-roles/fleet.md 의 Runner).
// start 는 흐름 3 의 B(13 ~ 18), line · exited 는 흐름 4, stop 은 흐름 7 의 4. 노드의 반이다 — 줄(Registry)은 모른다. 끝은 컨트롤 플레인에 알린다(NodeRpc exited · handoff).
// 호스트는 건넴 자리(spool/<인스턴스>)를 든다 — 사람의 묶음은 Loader 가 load 로 맡긴 것만 선다(엔진의 --handoff).

import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT_REFUSED, RESUMED_HEAD } from '../protocol/engine';
import type { StatusLine } from '../protocol/engine';
import type { TraceEnd, TraceFn } from '../protocol/observe';
import type { Console } from './console';
import type { Ports } from './ports';
import { Probe } from './probe';
import type { Process, Stream } from './process';
import { Spawner } from './spawner';

/** 새 run 의 이름 — 흐름 하나의 실행을 묶는다(흐름 14). */
export const freshRun = (): string => randomBytes(4).toString('hex');

/** 띄울 것 — 인스턴스 하나의 이름 · 세대와 그 존의 데이터셋 · NPC 묶음(설정). */
export interface Spec {
  readonly name: string;
  readonly epoch: number;
  readonly dataset: string;
  readonly npc: readonly string[];
}

/** 서버 하나의 일생 — starting → ready → stopping → stopped. 끝이 내림이 아니면 failed. */
export type ServerState = 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed';

/** Runner 가 받는 것 — 설정의 값과 다른 개념 · 컨트롤 플레인의 기능. */
export interface RunnerContext {
  readonly engineDir: string;
  readonly beat: number;
  readonly sparse: number;
  readonly party: string;
  /** NPC 계정 — 묶음은 Spec 의 npc */
  readonly npcAccount: string;
  readonly startLimitMs: number;
  readonly stopLimitMs: number;
  /** 에이전트가 이만큼 잇달아 끝나면 호스트를 내린다 */
  readonly restartLimit: number;
  /** 서명 키 — 호스트의 환경 HOST_AUTH_KEY */
  readonly key: string;
  /** 이 서버의 디렉터리 — 인스턴스마다 건넴 자리(캐릭터 파일) */
  readonly spool: string;
  readonly ports: Ports;
  readonly console: Console;
  /** NPC 계정의 토큰 — 앱이 준 Signer.issue */
  readonly issue: (account: string) => string;
  /** 그 인스턴스의 Store 를 이 서버에(흐름 3 의 13 — SnapshotStore.pull). 흔적은 부르는 쪽이 */
  readonly pull: (name: string, run: string) => Promise<string>;
  /** NodeRpc handoff — 호스트가 떠남 줄을 찍었다(흐름 4 의 3 ⇒ 흐름 10) */
  readonly handoff: (instance: string, character: string, to: string, run: string) => void;
  /** NodeRpc exited — 호스트가 끝났다(흐름 4 의 5 ⇒ 내림이면 흐름 7 의 5 · 6, 아니면 흐름 12). 뜨는 가운데의 끝은 start 가 던진다 */
  readonly exited: (instance: string, epoch: number, code: number, stopped: boolean, run: string) => void;
  readonly log: (line: string) => void;
  readonly trace: TraceFn;
}

/** 서버 하나 — Runner.servers 의 값(fleet.md 의 Runner 의 데이터 줄). */
export class Server {
  readonly name: string;
  readonly epoch: number;
  host: Process | null = null;
  agent: Process | null = null;
  state: ServerState = 'starting';
  port: number | null = null;
  /** 이 서버의 Store 자리 — pull 이 준 것 */
  store: string | null = null;
  /** 건넴 자리 — 엔진의 --handoff */
  readonly handoffDir: string;
  lastStatus: StatusLine | null = null;
  /** 지난 status 의 접속한 캐릭터들 — NPC 계정 밖 */
  linked: readonly string[] = [];
  lag = 0;
  /** 사람 없이 지난 Clock 의 수 — Scaler 가 본다 */
  idle = 0;
  /** 마지막 시작이 저장된 세계에서 이어갔는가 */
  resumed = false;
  why: string | null = null;
  agentRestarts = 0;
  /** 머리글의 마지막 줄을 보았다 — 이 뒤의 줄만 명령의 답이다 */
  listening = false;
  lastErr = '';
  /** 지난 떠남 줄 · backup 끝 줄 */
  departed: { readonly account: string | null; readonly to: string } | null = null;
  backed: { readonly dir: string; readonly now: number | null; readonly error: string | null } | null = null;
  ready: { resolve: () => void; reject: (e: Error) => void } | null = null;
  readonly backups: { readonly dir: string; readonly resolve: (b: { now: number | null; error: string | null }) => void }[] = [];
  stopRun: string | null = null;
  stopping: Promise<void> | null = null;

  constructor(name: string, epoch: number, handoffDir: string) {
    this.name = name;
    this.epoch = epoch;
    this.handoffDir = handoffDir;
  }

  get players(): number {
    return this.linked.length;
  }
}

export class Runner {
  // 데이터 — servers(인스턴스 이름 → 서버) · spool(이 서버의 디렉터리)
  readonly servers = new Map<string, Server>();
  readonly spool: string;
  private readonly ctx: RunnerContext;

  constructor(ctx: RunnerContext) {
    this.ctx = ctx;
    this.spool = ctx.spool;
  }

  get(name: string): Server | null {
    return this.servers.get(name) ?? null;
  }

  /** 흔적 하나 — 단위는 그 인스턴스. state 는 바뀐 뒤의 값. */
  private mark(flow: number, step: number, run: string, unit: string, end: TraceEnd, extra: { state?: string; counts?: Record<string, number> } = {}): void {
    this.ctx.trace({ flow, step, run, unit, end, ...extra });
  }

  /**
   * start — 흐름 3 의 B 가운데 노드의 일(13 ~ 18). 떠서 NPC 묶음을 묶고 에이전트를 띄우면 그 포트. 실패하면 프로세스를 거두고 던진다(줄은 부른 쪽이 failed 로).
   * refused 가 참인 오류는 같은 인자로 다시 띄워도 같다(데이터셋 거부 · NPC 묶음 거부).
   */
  async start(spec: Spec, run: string): Promise<number> {
    const was = this.servers.get(spec.name);
    if (was !== undefined && was.state !== 'stopped' && was.state !== 'failed') throw new Error(`이미 떠 있다 — ${spec.name}`);
    const server = new Server(spec.name, spec.epoch, join(this.spool, spec.name));
    this.servers.set(spec.name, server);
    const fail = (step: number, why: string, refused = false): Error => {
      server.state = 'failed';
      server.why = why;
      this.mark(3, step, run, spec.name, 'failed', { state: 'failed' });
      return Object.assign(new Error(why), { refused });
    };
    let store: string;
    try {
      store = await this.ctx.pull(spec.name, run); // 13 — 흔적은 부른 쪽(Fleet)이
    } catch (e) {
      throw fail(13, `Store 를 내려 받지 못했다 — ${(e as Error).message}`);
    }
    server.store = store;
    const port = await this.ctx.ports.take();
    this.mark(3, 14, run, spec.name, port === null ? 'failed' : 'ok', port === null ? {} : { counts: { port } }); // Ports.take
    if (port === null) throw fail(14, '빈 포트가 없다');
    server.port = port;
    mkdirSync(server.handoffDir, { recursive: true });
    const host = Spawner.host(this.ctx.engineDir, { dataset: spec.dataset, port, store, beat: this.ctx.beat, sparse: this.ctx.sparse, party: this.ctx.party, handoff: server.handoffDir }, this.ctx.key);
    server.host = host;
    host.onLine((stream, line) => this.line(spec.name, stream, line));
    host.onExit((code) => this.exited(spec.name, host, code));
    this.ctx.log(`${spec.name} fleet 호스트를 띄운다 — pid ${host.pid} · 포트 ${port} · 세대 ${spec.epoch}`);
    this.mark(3, 15, run, spec.name, 'ok'); // Spawner.host

    const readied = new Promise<void>((resolve, reject) => (server.ready = { resolve, reject }));
    const limit = setTimeout(() => server.ready?.reject(new Error(`머리글이 ${this.ctx.startLimitMs}ms 안에 오지 않았다`)), this.ctx.startLimitMs);
    try {
      await readied;
    } catch (e) {
      server.ready = null;
      const asked = server.state === 'stopping'; // 뜨는 가운데 stop 을 받았다
      if (host.alive) host.kill('SIGKILL');
      await host.exited;
      if (asked) {
        server.state = 'stopped';
        this.mark(3, 16, run, spec.name, 'failed', { state: 'stopped' });
        throw new Error('뜨는 가운데 내렸다');
      }
      throw fail(16, (e as Error).message + (server.lastErr === '' ? '' : ` — ${server.lastErr}`), host.exit === EXIT_REFUSED);
    } finally {
      clearTimeout(limit);
      server.ready = null;
    }
    this.mark(3, 16, run, spec.name, 'ok'); // Probe.read — 머리글의 마지막 줄
    // NPC 묶음을 NPC 계정에 — 주소를 답하기 전이라 어떤 사람의 접속보다 먼저다(흐름 3 의 17)
    for (const body of spec.npc) {
      const answer = await this.ctx.console.command(spec.name, `grant ${this.ctx.npcAccount} ${body}`);
      if (server.state === 'stopping' || !host.alive) {
        await host.exited;
        if (server.state === 'stopping' || server.state === 'stopped') {
          server.state = 'stopped';
          this.mark(3, 17, run, spec.name, 'failed', { state: 'stopped' });
          throw new Error('뜨는 가운데 내렸다');
        }
        throw fail(17, `호스트가 NPC 묶음을 묶는 가운데 끝났다 — exit ${host.exit}${server.lastErr === '' ? '' : ` — ${server.lastErr}`}`);
      }
      if (answer === null || !answer.startsWith('grant — ')) {
        host.write('stop');
        await host.exited;
        throw fail(17, `NPC 묶음을 묶지 못했다 — grant ${this.ctx.npcAccount} ${body} → ${answer ?? '답 없음'}`, true);
      }
      this.mark(3, 17, run, spec.name, 'ok'); // Console.command — grant 하나
    }
    this.spawnAgent(server);
    this.mark(3, 18, run, spec.name, 'ok'); // Spawner.agent
    server.state = 'ready';
    return port;
  }

  private spawnAgent(server: Server): void {
    const agent = Spawner.agent(this.ctx.engineDir, { url: `ws://localhost:${server.port}`, account: this.ctx.npcAccount, token: this.ctx.issue(this.ctx.npcAccount) });
    server.agent = agent;
    let shown = 0;
    agent.onLine((stream, line) => {
      if (stream === 'stderr' || shown++ < 1) this.ctx.log(`${server.name} agent ${line}`); // 두뇌가 창마다 찍는다 — 첫 줄과 stderr 만
    });
    agent.onExit((code) => this.agentExited(server, agent, code));
  }

  private agentExited(server: Server, agent: Process, code: number): void {
    if (server.agent === agent) server.agent = null;
    this.ctx.log(`${server.name} agent 끝났다 — exit ${code}`);
    if (server.state !== 'ready' || server.host === null) return;
    server.agentRestarts++;
    if (server.agentRestarts > this.ctx.restartLimit) {
      server.why = `에이전트가 ${server.agentRestarts} 번 끝났다`;
      server.host.kill('SIGTERM'); // 호스트를 내린다 — 끝이 내림이 아니므로 흐름 12 가 수습한다
      return;
    }
    setTimeout(() => {
      if (server.state === 'ready' && server.agent === null) this.spawnAgent(server);
    }, 500).unref();
  }

  /**
   * line — 흐름 4 의 1 ~ 3(Runner.line). 흔적은 알아본 줄(준비됨 · 멈춤 · 명령의 답 · 떠남 · backup 끝)과 사람 수 · 틱 지연을 바꾼 status 에만 남긴다
   * — 같은 줄이 되풀이되면 남기지 않는다(흐름 14 규칙). 떠남이면 컨트롤 플레인에 알린다(⇒ 흐름 10).
   */
  line(name: string, stream: Stream, text: string): void {
    const server = this.servers.get(name);
    if (server === undefined) return;
    if (stream === 'stderr') {
      server.lastErr = text;
      this.ctx.log(`${name} host ${text}`);
      return;
    }
    const read = Probe.read(text);
    const before = { players: server.players, lag: server.lag };
    if (read.kind === 'status') {
      server.lastStatus = read.status;
      server.linked = read.accounts.filter((a) => a !== this.ctx.npcAccount);
      server.lag = read.status.lag;
    } else if (text.trim() !== '') this.ctx.log(`${name} host ${text}`); // status 는 묻는 때마다 온다 — 기록하지 않는다
    const answer = read.kind !== 'ready' && server.listening && this.ctx.console.answer(name, text);
    const changed = read.kind === 'status' && (server.players !== before.players || server.lag !== before.lag);
    const run = freshRun();
    if (read.kind === 'ready' || read.kind === 'halt' || read.kind === 'handoff' || read.kind === 'backed' || answer || changed) {
      this.mark(4, 1, run, name, 'ok'); // Process.onLine
      this.mark(4, 2, run, name, 'ok'); // Probe.read
      // Runner.line — status 면 사람 수 · 틱 지연, backup 끝이면 그 now, 떠남은 맡은 이가 있는가(사람은 싣지 않는다 — 노드는 캐릭터만 안다)
      const counts: Record<string, number> | undefined =
        read.kind === 'status' ? { players: server.players, beats: read.status.beats, lag: server.lag }
        : read.kind === 'backed' && read.now !== null ? { backup: read.now }
        : read.kind === 'handoff' ? { departed: read.account === null ? 0 : 1 }
        : undefined;
      this.mark(4, 3, run, name, read.kind === 'backed' && read.error !== null ? 'failed' : 'ok', counts === undefined ? {} : { counts });
    }
    if (read.kind === 'ready') {
      server.listening = true;
      server.ready?.resolve();
      return;
    }
    if (text.startsWith(RESUMED_HEAD)) server.resumed = true;
    if (read.kind === 'handoff') {
      server.departed = { account: read.account, to: read.to };
      if (read.account !== null && read.account !== this.ctx.npcAccount) this.ctx.handoff(name, read.account, read.to, run); // NodeRpc handoff ⇒ 흐름 10
    }
    if (read.kind === 'backed') {
      server.backed = { dir: read.dir, now: read.now, error: read.error };
      const i = server.backups.findIndex((b) => b.dir === read.dir);
      if (i >= 0) server.backups.splice(i, 1)[0]!.resolve({ now: read.now, error: read.error });
    }
  }

  /** backed — 그 호스트가 `backup <dir>` 의 끝 줄을 찍기를 기다린다(Backuper.backup). 한계 안에 없거나 호스트가 끝나면 error. */
  backed(name: string, dir: string, limitMs: number): Promise<{ readonly now: number | null; readonly error: string | null }> {
    const server = this.servers.get(name);
    if (server === undefined || server.host === null) return Promise.resolve({ now: null, error: '호스트가 없다' });
    return new Promise((resolve) => {
      const entry = { dir, resolve: (b: { now: number | null; error: string | null }) => (clearTimeout(timer), resolve(b)) };
      const timer = setTimeout(() => {
        const i = server.backups.indexOf(entry);
        if (i >= 0) server.backups.splice(i, 1);
        resolve({ now: null, error: `끝 줄이 ${limitMs}ms 안에 오지 않았다` });
      }, limitMs);
      server.backups.push(entry);
    });
  }

  /** exited — 흐름 4 의 4 ~ 6. 에이전트를 함께 끝내고 포트를 돌려주고 컨트롤 플레인에 알린다. 뜨는 가운데의 끝은 start 가 받는다. */
  private exited(name: string, host: Process, code: number): void {
    const server = this.servers.get(name);
    if (server === undefined || server.host !== host) return;
    server.host = null;
    server.listening = false;
    this.ctx.console.drop(name);
    for (const b of server.backups.splice(0)) b.resolve({ now: null, error: '호스트가 끝났다' });
    server.agent?.kill();
    const run = server.stopRun ?? freshRun();
    this.ctx.log(`${name} host 끝났다 — exit ${code}`);
    this.mark(4, 4, run, name, 'ok', { counts: { exit: code } }); // Process.onExit
    server.linked = [];
    if (server.port !== null) {
      this.ctx.ports.free(server.port);
      this.mark(4, 6, run, name, 'ok', { counts: { port: server.port } }); // Ports.free
    }
    if (server.state === 'starting' || server.ready !== null) {
      server.ready?.reject(new Error(`호스트가 머리글 전에 끝났다 — exit ${code}`));
      return; // start 가 센다
    }
    const stopped = server.state === 'stopping' || (code === 0 && server.why === null);
    server.state = stopped ? 'stopped' : 'failed';
    if (!stopped) server.why = server.why ?? `호스트가 끝났다 — exit ${code}${server.lastErr === '' ? '' : ` — ${server.lastErr}`}`;
    this.mark(4, 5, run, name, stopped ? 'ok' : 'failed', { state: server.state, counts: { players: 0 } }); // Runner.exited
    this.ctx.exited(name, server.epoch, code, stopped, run); // NodeRpc exited
  }

  /** stop — 흐름 7 의 4. stdin 에 stop, 한계 안에 끝나지 않으면 SIGINT, 그래도면 SIGKILL. 에이전트도 끝낸다. 뜨는 가운데면 그만두게 한다. */
  stop(name: string, run: string): Promise<void> {
    const server = this.servers.get(name);
    if (server === undefined) return Promise.resolve();
    if (server.stopping !== null) return server.stopping;
    const host = server.host;
    if (host === null || !host.alive) {
      server.agent?.kill();
      if (server.state === 'starting') server.state = 'stopping'; // 띄우기 전 — start 가 보고 그만둔다
      return Promise.resolve();
    }
    server.state = 'stopping';
    server.stopRun = run;
    this.mark(7, 4, run, name, 'ok', { state: 'stopping' }); // Runner.stop
    server.stopping = (async () => {
      if (server.listening) host.write('stop');
      else host.kill('SIGINT');
      const soft = setTimeout(() => host.kill('SIGINT'), this.ctx.stopLimitMs);
      const hard = setTimeout(() => host.kill('SIGKILL'), this.ctx.stopLimitMs * 2);
      await host.exited;
      clearTimeout(soft);
      clearTimeout(hard);
      const agent = server.agent;
      agent?.kill();
      if (agent !== null) await agent.exited;
    })().finally(() => {
      server.stopping = null;
      server.stopRun = null;
    });
    return server.stopping;
  }
}
