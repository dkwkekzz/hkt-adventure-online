// Connection — 클라이언트의 소켓과 호스트의 소켓을 잇는다 (design/02-roles/gateway.md 의 Connection, 흐름 9 의 10 · 11 · 흐름 11 의 1).
// 글의 안을 풀지 않는다 — 호스트로 가는 첫 글(`Host 2`)의 자격만 attach 가 준 토큰으로 바꾼다. 나머지는 받은 그대로(글 · 바이너리) 넘긴다.
// 호스트 쪽이 닫히면: 엔진의 거절 코드(4000 ~ 4999)이거나 아직 열리기 전이면 그 코드로 바로 닫는다. 아니면 rerouting 으로 한계(rerouteMs)까지
// 기다린다 — 다른 호스트로 잇는 것(Connection.reroute, 흐름 10 · 12)은 plan 07 이 세운다. 한계가 지나면 1001.

import WebSocket from 'ws';
import type { RawData } from 'ws';
import type { TraceFn } from '../protocol/observe';
import type { Attached, Detach } from '../protocol/session';
import type { Meter, RateLimiter } from './rate-limiter';

export type ConnectionState = 'opening' | 'open' | 'rerouting' | 'closed';

/** Acceptor 가 Connection 에 주는 것. */
export interface ConnectionContext {
  readonly gate: string;
  readonly limiter: RateLimiter;
  readonly detach: Detach;
  readonly rerouteMs: number;
  readonly trace: TraceFn;
  readonly log: (line: string) => void;
  /** 닫혔다 — Acceptor 가 제 표에서 뺀다 */
  readonly closed: (c: Connection) => void;
}

/** ws 가 보낼 수 있는 닫힘 코드 — 1005 · 1006 · 1015 는 보내지 못한다. */
const sendable = (code: number): boolean => code === 1000 || (code >= 1001 && code <= 1003) || (code >= 1007 && code <= 1014) || (code >= 3000 && code <= 4999);

export class Connection {
  // 데이터 — character(불변) · client · upstream · instance · state
  readonly character: string;
  readonly client: WebSocket;
  upstream: WebSocket | null = null;
  instance: string | null = null;
  state: ConnectionState = 'opening';
  /** 보내고 답을 기다리는 ping 의 때 — Keepalive 가 든다 */
  pingAt: number | null = null;
  readonly ip: string;
  readonly run: string;
  private readonly ctx: ConnectionContext;
  private readonly meter: Meter = { start: 0, n: 0 };
  private readonly pending: { data: RawData; binary: boolean }[] = [];
  private attached = false;
  private relayed = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(character: string, client: WebSocket, ip: string, run: string, ctx: ConnectionContext) {
    this.character = character;
    this.client = client;
    this.ip = ip;
    this.run = run;
    this.ctx = ctx;
    client.on('message', (data, binary) => this.fromClient(data, binary));
    client.on('pong', () => (this.pingAt = null));
    client.on('close', (code) => this.close(code, '클라이언트가 닫았다'));
    client.on('error', () => {});
  }

  private mark(flow: number, step: number, end: 'ok' | 'wait' | 'refused' | 'failed', extra: { counts?: Record<string, number> } = {}): void {
    this.ctx.trace({ flow, step, run: this.run, unit: this.instance ?? '-', end, account: this.character, ...extra });
  }

  /** open — 흐름 9 의 10. 호스트에 소켓을 열고 첫 글을 그 토큰으로 보낸다. hello 는 클라이언트의 첫 글(자격만 바뀐다). */
  open(to: Attached, hello: Record<string, unknown>): void {
    if (this.state === 'closed') return;
    this.attached = true;
    this.instance = to.instance;
    const up = new WebSocket(to.address, { maxPayload: 64 * 1024 * 1024 });
    this.upstream = up;
    up.on('open', () => {
      if (this.state === 'closed') return up.close(1000);
      up.send(JSON.stringify({ ...hello, credential: to.token }));
      for (const m of this.pending.splice(0)) up.send(m.data, { binary: m.binary });
      this.state = 'open';
      this.mark(9, 10, 'ok');
    });
    up.on('message', (data, binary) => this.fromHost(data, binary));
    up.on('close', (code) => this.hostClosed(code));
    up.on('error', (e) => this.ctx.log(`${this.character} gateway 호스트 쪽 ${e.message}`));
  }

  /** relay — 흐름 9 의 11. 호스트의 글을 클라이언트로. 첫 글(열림 · 거절)을 넘기면 클라이언트를 기다린다(◇). */
  private fromHost(data: RawData, binary: boolean): void {
    if (this.client.readyState !== WebSocket.OPEN) return;
    this.client.send(data, { binary });
    if (!this.relayed) {
      this.relayed = true;
      this.mark(9, 11, 'wait');
    }
  }

  /** relay — 클라이언트의 글을 RateLimiter.check 뒤 호스트로. 호스트가 아직 열리지 않았으면 쌓는다. */
  private fromClient(data: RawData, binary: boolean): void {
    if (this.state === 'closed') return;
    const bytes = Array.isArray(data) ? data.reduce((n, b) => n + b.length, 0) : data instanceof ArrayBuffer ? data.byteLength : data.length;
    if (!this.ctx.limiter.check(bytes, this.meter)) return; // 버린다 — 수는 RateLimiter 가 센다
    const up = this.upstream;
    if (up !== null && up.readyState === WebSocket.OPEN) up.send(data, { binary });
    else if (this.state === 'opening') this.pending.push({ data, binary });
  }

  private hostClosed(code: number): void {
    if (this.state === 'closed') return;
    this.upstream = null;
    if (this.state === 'opening' || (code >= 4000 && code <= 4999)) return this.close(code, '호스트가 닫았다');
    this.state = 'rerouting'; // 다른 호스트로 잇기를 기다린다 — 한계가 지나면 닫는다
    this.timer = setTimeout(() => this.close(1001, '호스트가 돌아오지 않았다'), this.ctx.rerouteMs);
    this.timer.unref();
  }

  ping(): void {
    if (this.client.readyState === WebSocket.OPEN) this.client.ping();
  }

  /** close — 흐름 11 의 1. 양쪽을 닫고 컨트롤 플레인에 detach 를 보낸다(이어졌던 접속만). 두 번 불려도 한 번. */
  close(code: number, why = ''): void {
    if (this.state === 'closed') return;
    this.state = 'closed';
    if (this.timer !== null) clearTimeout(this.timer);
    const up = this.upstream;
    this.upstream = null;
    if (up !== null && (up.readyState === WebSocket.OPEN || up.readyState === WebSocket.CONNECTING)) up.close(1000);
    if (this.client.readyState === WebSocket.OPEN || this.client.readyState === WebSocket.CONNECTING) this.client.close(sendable(code) ? code : 1001); // 까닭 글은 싣지 않는다 — 닫힘 코드가 뜻을 든다(엔진의 표)
    this.ctx.limiter.leave(this.ip);
    this.ctx.closed(this);
    if (why !== '') this.ctx.log(`${this.character} gateway 닫았다 — ${code} · ${why}`);
    if (this.attached) {
      this.mark(11, 1, 'ok', { counts: { code } });
      this.ctx.detach(this.character, this.ctx.gate, this.run);
    }
  }
}
