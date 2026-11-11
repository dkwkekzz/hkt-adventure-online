// Shard — 세계 하나: 호스트 하나 + 에이전트 하나 + Store 자리 하나 (design/02-roles/fleet.md 의 Shard). 사람은 모두 여기 붙는다 — 계정마다 사람의 묶음 하나(엔진의 --party).
// start 는 흐름 3 의 5 ~ 7, line · exited 는 흐름 4, stop 은 흐름 5 의 3, command 는 Console 글 한 줄과 그 답.

import { randomBytes } from 'node:crypto';
import { EXIT_REFUSED, RESUMED_HEAD } from '../protocol/engine';
import type { StatusLine } from '../protocol/engine';
import type { Address } from '../protocol/api';
import type { TraceEnd, TraceFn } from '../protocol/observe';
import type { Row } from './assignment';
import { Probe } from './probe';
import type { Process, Stream } from './process';
import { Spawner } from './spawner';

export type ShardState = 'stopped' | 'starting' | 'ready' | 'stopping' | 'failed';

/** Fleet 이 Shard 에 주는 것 — 설정의 값과 함수 셋. Shard 는 Fleet 을 모른다. */
export interface ShardContext {
  readonly engineDir: string;
  readonly beat: number;
  readonly sparse: number;
  readonly npc: { readonly account: string; readonly bodies: readonly string[] };
  /** 사람의 묶음의 틀 — 엔진의 --party(body 이름). 계정마다 그 틀에서 묶음이 선다. */
  readonly party: string;
  readonly publicHost: string;
  readonly secure: boolean;
  /** 뷰어 페이지의 주소 — 서비스의 Static 이 준다(`…/play`). */
  readonly pageUrl: string;
  readonly startLimitMs: number;
  readonly stopLimitMs: number;
  readonly commandLimitMs: number;
  readonly restartLimit: number;
  /** 서명 키 — 호스트의 환경 HOST_AUTH_KEY. */
  readonly key: string;
  /** NPC 계정의 토큰을 낸다 — 앱이 준 Signer.issue. */
  readonly issue: (account: string) => string;
  readonly log: (line: string) => void;
  /** 흔적을 남긴다 — 앱이 준 Monitor.trace(흐름 14). */
  readonly trace: TraceFn;
}

/** 새 run 의 이름 — 흐름 하나의 실행을 묶는다(흐름 14). */
export const freshRun = (): string => randomBytes(4).toString('hex');

interface Waiter {
  readonly command: string;
  readonly resolve: (answer: string | null) => void;
}

export class Shard {
  // 데이터 — fleet.md 의 Shard 줄 그대로
  readonly name: string; // 세계의 이름 — 설정의 world
  row: Row;
  state: ShardState = 'stopped';
  host: Process | null = null;
  agent: Process | null = null;
  lastStatus: StatusLine | null = null;
  players = 0;
  linked: readonly string[] = []; // 지난 status 의 접속한 계정 — NPC 계정 밖
  idle = 0;
  restarts = 0;
  agentRestarts = 0;
  dirty = false;
  why: string | null = null;
  /** 마지막 시작이 저장된 세계에서 이어갔는가 — 머리글의 둘째 줄. */
  resumed = false;
  private readonly waiting: Waiter[] = [];
  private readonly ctx: ShardContext;
  private starting: Promise<void> | null = null;
  private stopping: Promise<void> | null = null;
  private ready: { resolve: () => void; reject: (e: Error) => void } | null = null;
  private listening = false; // 머리글의 마지막 줄을 보았다 — 이 뒤의 줄만 명령의 답이다
  private lastErr = '';

  constructor(name: string, row: Row, ctx: ShardContext) {
    this.name = name;
    this.row = row;
    this.ctx = ctx;
  }

  /** 흔적 하나 — 단위는 이 세계. state 는 바뀐 뒤의 값. */
  private mark(flow: number, step: number, run: string, end: TraceEnd, extra: { state?: string; counts?: Record<string, number> } = {}): void {
    this.ctx.trace({ flow, step, run, unit: this.name, end, ...extra });
  }

  /** start — 흐름 3 의 B(11 ~ 19). ready 면 그대로, starting 이면 그것을 기다린다. 셈이 한계를 넘은 failed 는 거절. run 은 부른 흐름의 것. */
  async start(run: string = freshRun()): Promise<void> {
    if (this.state === 'ready') return;
    if (this.starting !== null) return this.starting;
    if (this.stopping !== null) await this.stopping;
    if (this.state === 'failed' && this.restarts > this.ctx.restartLimit) throw new Error(`샤드가 멈췄다 — ${this.why ?? '까닭 없음'} (운영자: start ${this.name})`);
    if (this.row.port === null) throw new Error('포트가 없다');
    this.starting = this.boot(run).finally(() => (this.starting = null));
    return this.starting;
  }

  private async boot(run: string): Promise<void> {
    const port = this.row.port!;
    this.state = 'starting';
    this.mark(3, 11, run, 'ok', { state: 'starting', counts: { port, players: 0 } }); // 줄을 starting 으로(Registry.put)
    this.why = null;
    this.dirty = true;
    this.resumed = false;
    this.lastStatus = null;
    this.players = 0;
    this.idle = 0;
    this.agentRestarts = 0;
    this.listening = false;
    const host = Spawner.host(this.ctx.engineDir, { dataset: this.row.dataset, port, store: this.row.storeDir, beat: this.ctx.beat, sparse: this.ctx.sparse, party: this.ctx.party }, this.ctx.key);
    this.host = host;
    host.onLine((stream, line) => this.line('host', stream, line));
    host.onExit((code) => this.exited('host', code));
    this.ctx.log(`${this.name} fleet 호스트를 띄운다 — pid ${host.pid} · 포트 ${port}`);
    this.mark(3, 15, run, 'ok'); // Spawner.host

    const readied = new Promise<void>((resolve, reject) => (this.ready = { resolve, reject }));
    const limit = setTimeout(() => this.ready?.reject(new Error(`머리글이 ${this.ctx.startLimitMs}ms 안에 오지 않았다`)), this.ctx.startLimitMs);
    try {
      await readied;
    } catch (e) {
      this.ready = null; // 이 뒤의 끝은 boot 가 센다
      const asked = (this.state as ShardState) === 'stopping'; // 뜨는 가운데 stop 을 받았다 — 실패가 아니다
      if (host.alive) {
        if (!asked) this.restarts++; // 한계 안에 머리글이 없었다
        host.kill('SIGKILL');
      }
      await host.exited;
      if (asked) {
        this.state = 'stopped';
        this.mark(3, 16, run, 'failed', { state: 'stopped' });
        throw new Error('뜨는 가운데 내렸다');
      }
      this.why = (e as Error).message + (this.lastErr === '' ? '' : ` — ${this.lastErr}`);
      this.state = 'failed';
      this.mark(3, 16, run, 'failed', { state: 'failed', counts: { restarts: this.restarts } }); // Probe.read — 머리글이 오지 않았다
      throw new Error(this.why);
    } finally {
      clearTimeout(limit);
      this.ready = null;
    }
    this.mark(3, 16, run, 'ok'); // Probe.read — 머리글의 마지막 줄
    // NPC 묶음을 NPC 계정에 — 주소를 답하기 전이라 어떤 사람의 접속보다 먼저다(흐름 3 의 17)
    for (const body of this.ctx.npc.bodies) {
      if ((this.state as ShardState) === 'stopping') break;
      const answer = await this.command(`grant ${this.ctx.npc.account} ${body}`);
      if ((this.state as ShardState) === 'stopping' || (this.state as ShardState) === 'stopped') {
        await host.exited;
        this.mark(3, 17, run, 'failed', { state: this.state });
        throw new Error('뜨는 가운데 내렸다');
      }
      if (!host.alive) {
        this.restarts++;
        this.why = `호스트가 NPC 묶음을 묶는 가운데 끝났다 — exit ${host.exit}${this.lastErr === '' ? '' : ` — ${this.lastErr}`}`;
        this.state = 'failed';
        this.mark(3, 17, run, 'failed', { state: 'failed', counts: { restarts: this.restarts } });
        throw new Error(this.why);
      }
      if (answer === null || !answer.startsWith('grant — ')) {
        this.why = `NPC 묶음을 묶지 못했다 — grant ${this.ctx.npc.account} ${body} → ${answer ?? '답 없음'}`;
        this.restarts = this.ctx.restartLimit + 1; // 같은 설정으로 다시 띄워도 같다
        host.write('stop');
        await host.exited;
        this.state = 'failed';
        this.mark(3, 17, run, 'failed', { state: 'failed' });
        throw new Error(this.why);
      }
      this.mark(3, 17, run, 'ok'); // Console.command — grant 하나
    }
    if ((this.state as ShardState) === 'stopping') {
      await host.exited; // 머리글과 stop 이 엇갈렸다 — 내리는 길이 끝낸다
      throw new Error('뜨는 가운데 내렸다');
    }
    this.spawnAgent();
    this.mark(3, 18, run, 'ok'); // Spawner.agent
    this.state = 'ready';
    this.mark(3, 19, run, 'ok', { state: 'ready', counts: { port, players: this.players } }); // 줄을 ready 로(Registry.put)
  }

  private spawnAgent(): void {
    const port = this.row.port!;
    const agent = Spawner.agent(this.ctx.engineDir, { url: `ws://localhost:${port}`, account: this.ctx.npc.account, token: this.ctx.issue(this.ctx.npc.account) });
    this.agent = agent;
    let shown = 0;
    agent.onLine((stream, line) => {
      if (stream === 'stderr' || shown++ < 1) this.ctx.log(`${this.name} agent ${line}`); // 두뇌가 창마다 찍는다 — 첫 줄과 stderr 만
    });
    agent.onExit((code) => this.exited('agent', code));
  }

  /**
   * line — 흐름 4 의 1 ~ 3. 흔적은 알아본 줄(준비됨 · 멈춤 · 명령의 답)과 사람 수를 바꾼 status 에만 남긴다 — 박자마다 오는 같은 줄은 남기지 않는다(흐름 14 규칙).
   */
  line(which: 'host' | 'agent', stream: Stream, text: string): void {
    if (which !== 'host') return;
    if (stream === 'stderr') {
      this.lastErr = text;
      this.ctx.log(`${this.name} host ${text}`);
      return;
    }
    const read = Probe.read(text);
    const before = this.players;
    if (read.kind === 'status') {
      this.lastStatus = read.status;
      this.linked = read.accounts.filter((a) => a !== this.ctx.npc.account);
      this.players = this.linked.length;
    } else if (text.trim() !== '') this.ctx.log(`${this.name} host ${text}`); // status 는 박자마다 온다 — 기록하지 않는다
    const head = this.waiting[0];
    const answer = read.kind !== 'ready' && this.listening && head !== undefined && Probe.answers(head.command, text);
    if (read.kind === 'ready' || read.kind === 'halt' || answer || (read.kind === 'status' && this.players !== before)) {
      const run = freshRun();
      this.mark(4, 1, run, 'ok'); // Process.onLine
      this.mark(4, 2, run, 'ok'); // Probe.read
      this.mark(4, 3, run, 'ok', read.kind === 'status' ? { counts: { players: this.players, beats: read.status.beats } } : {}); // Runner.line 의 일
    }
    if (read.kind === 'ready') {
      this.listening = true;
      this.ready?.resolve();
      return;
    }
    if (text.startsWith(RESUMED_HEAD)) this.resumed = true;
    if (answer) {
      this.waiting.shift();
      head!.resolve(text);
    }
  }

  /** exited — 흐름 4 의 3 · 4. */
  exited(which: 'host' | 'agent', code: number): void {
    if (which === 'agent') {
      this.agent = null;
      this.ctx.log(`${this.name} agent 끝났다 — exit ${code}`);
      if (this.state !== 'ready' || this.host === null) return;
      this.agentRestarts++;
      if (this.agentRestarts > this.ctx.restartLimit) {
        this.why = `에이전트가 ${this.agentRestarts} 번 끝났다`;
        void this.stop().then(() => {
          this.state = 'failed';
          this.restarts = this.ctx.restartLimit + 1;
        });
        return;
      }
      setTimeout(() => {
        if (this.state === 'ready' && this.agent === null) this.spawnAgent();
      }, 500).unref();
      return;
    }

    this.host = null;
    for (const w of this.waiting.splice(0)) w.resolve(null);
    this.agent?.kill();
    const wasStopping = this.state === 'stopping';
    this.ctx.log(`${this.name} host 끝났다 — exit ${code}`);
    const run = freshRun();
    this.mark(4, 4, run, 'ok', { counts: { exit: code } }); // Process.onExit
    if (this.state === 'starting' || this.ready !== null) {
      if (this.ready === null) return; // boot 가 한계로 끝냈다 — 거기서 센다
      this.ready.reject(new Error(`호스트가 머리글 전에 끝났다 — exit ${code}`));
      if (wasStopping) return; // 뜨는 가운데 내렸다 — boot 가 stopped 로
      if (code === EXIT_REFUSED) this.restarts = this.ctx.restartLimit + 1; // 같은 인자로 다시 띄워도 같다
      else this.restarts++;
      return; // boot 가 failed 로
    }
    if (wasStopping || code === 0) {
      this.state = 'stopped';
      this.restarts = 0;
      this.players = 0;
      this.mark(4, 5, run, 'ok', { state: 'stopped', counts: { players: 0 } }); // Runner.exited 의 일
      return;
    }
    this.state = 'failed';
    this.why = `호스트가 끝났다 — exit ${code}${this.lastErr === '' ? '' : ` — ${this.lastErr}`}`;
    if (code === EXIT_REFUSED) this.restarts = this.ctx.restartLimit + 1;
    else this.restarts++;
    this.players = 0;
    this.mark(4, 5, run, 'failed', { state: 'failed', counts: { players: 0, restarts: this.restarts } });
  }

  /** command — 호스트의 stdin 에 글 한 줄, 그 답 글 한 줄. 내려가 있거나 한계 안에 답이 없으면 null. `stop` 은 stop() 으로. */
  command(line: string): Promise<string | null> {
    const name = line.trim().split(/\s+/)[0] ?? '';
    if (name === 'stop') return this.stop().then(() => 'stopped');
    const host = this.host;
    if (host === null || !host.alive) return Promise.resolve(null);
    return new Promise((resolve) => {
      const waiter: Waiter = {
        command: name,
        resolve: (answer) => {
          clearTimeout(timer);
          resolve(answer);
        },
      };
      const timer = setTimeout(() => {
        const i = this.waiting.indexOf(waiter);
        if (i >= 0) this.waiting.splice(i, 1);
        resolve(null);
      }, this.ctx.commandLimitMs);
      this.waiting.push(waiter);
      host.write(line.trim());
    });
  }

  /** stop — 흐름 7 의 4(Runner.stop 의 일). stdin 에 stop, 한계 안에 끝나지 않으면 SIGINT, 그래도면 SIGKILL. 에이전트도 끝낸다. run 은 부른 흐름의 것. */
  stop(run: string = freshRun()): Promise<void> {
    if (this.stopping !== null) return this.stopping;
    const host = this.host;
    if (host === null) {
      this.agent?.kill();
      return Promise.resolve();
    }
    this.state = 'stopping';
    this.mark(7, 4, run, 'ok', { state: 'stopping' });
    this.stopping = (async () => {
      host.write('stop');
      const soft = setTimeout(() => host.kill('SIGINT'), this.ctx.stopLimitMs);
      const hard = setTimeout(() => host.kill('SIGKILL'), this.ctx.stopLimitMs * 2);
      await host.exited;
      clearTimeout(soft);
      clearTimeout(hard);
      const agent = this.agent;
      agent?.kill();
      if (agent !== null) await agent.exited;
    })().finally(() => (this.stopping = null));
    return this.stopping;
  }

  /** address — 흐름 3 의 8. page 는 서비스의 Static 이 주는 뷰어 페이지 — 자격은 ?token=, 이 샤드는 ?ws=. */
  address(token: string): Address {
    const ws = `${this.ctx.secure ? 'wss' : 'ws'}://${this.ctx.publicHost}:${this.row.port}`;
    return { page: `${this.ctx.pageUrl}?token=${encodeURIComponent(token)}&ws=${encodeURIComponent(ws)}`, ws };
  }
}
