// Acceptor — 새 소켓이 누구의 것인지 확인한다 (design/02-roles/gateway.md 의 Acceptor, 흐름 1 의 4 · 9 의 1 ~ 3).
// 첫 글(`Host 2`)의 자격만 읽는다 — 글이 아니거나 첫 글이 아니면 4001, 토큰이 틀리거나 세션이 없으면 `Link 1` 거절 뒤 4002(엔진과 같은 코드).
// 같은 캐릭터의 옛 접속은 닫는다(4000 — 나중 접속이 이긴다).

import { createServer } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import type { RawData, WebSocket } from 'ws';
import type { TraceFn } from '../protocol/observe';
import type { Attach, Detach } from '../protocol/session';
import { Connection } from './connection';
import type { RateLimiter } from './rate-limiter';

export interface AcceptorOptions {
  readonly gate: string;
  readonly verify: (token: unknown) => string | null;
  readonly attach: Attach;
  readonly detach: Detach;
  readonly limiter: RateLimiter;
  readonly helloMs: number;
  readonly rerouteMs: number;
  readonly trace: TraceFn;
  readonly log: (line: string) => void;
  readonly fresh: () => string;
}

const reject = (ws: WebSocket, code: number, why: string): void => {
  if (code === 4002 && ws.readyState === ws.OPEN) ws.send(JSON.stringify({ step: 'Link 1', reject: { why } }));
  ws.close(code);
};

export class Acceptor {
  // 데이터 — verify · attach · detach(앱이 준다) · limiter(참조) · connections
  readonly connections = new Map<string, Connection>();
  readonly limiter: RateLimiter;
  private readonly o: AcceptorOptions;
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;

  constructor(o: AcceptorOptions) {
    this.o = o;
    this.limiter = o.limiter;
  }

  /** listen — 흐름 1 의 4. 소켓을 듣는다. 듣는 포트를 준다. */
  async listen(port: number): Promise<number> {
    const wss = new WebSocketServer({ noServer: true, maxPayload: Math.max(this.limiter.maxBytes * 4, 1024) });
    const server = createServer((_req, res) => {
      res.writeHead(426, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('게이트웨이 — WebSocket 으로 붙는다\n');
    });
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => this.upgrade(req, socket, head));
    this.server = server;
    this.wss = wss;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, () => resolve());
    });
    const at = server.address();
    return typeof at === 'object' && at !== null ? at.port : port;
  }

  /** 흐름 9 의 1 — 그 주소의 접속이 한계 안이면 소켓을 받는다. 아니면 429. */
  private upgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const ip = req.socket.remoteAddress ?? '-';
    const run = this.o.fresh();
    if (!this.limiter.admit(ip)) {
      this.o.trace({ flow: 9, step: 1, run, unit: '-', end: 'refused', counts: { open: this.limiter.connections } });
      socket.end('HTTP/1.1 429 Too Many Requests\r\nconnection: close\r\ncontent-length: 0\r\n\r\n');
      setTimeout(() => socket.destroy(), 1000).unref(); // 받지 않은 소켓을 붙들지 않는다
      return;
    }
    this.o.trace({ flow: 9, step: 1, run, unit: '-', end: 'ok' });
    this.wss!.handleUpgrade(req, socket, head, (ws) => this.accept(ws, ip, run));
  }

  /** accept — 흐름 9 의 2 · 3. 한계(helloMs) 안의 첫 글로 누구인지 알고, 세션을 묻고(attach), 호스트에 잇는다. */
  accept(ws: WebSocket, ip: string, run: string): void {
    let settled = false;
    const refuse = (code: number, why: string, step = 2): void => {
      this.o.trace({ flow: 9, step, run, unit: '-', end: 'refused', counts: { code } });
      this.o.log(`gateway 받지 않았다 — ${code} · ${why}`);
      reject(ws, code, why);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      this.limiter.leave(ip);
      refuse(4001, `첫 글이 ${this.o.helloMs}ms 안에 오지 않았다`);
    }, this.o.helloMs);
    timer.unref();
    ws.on('error', () => {});
    ws.once('close', () => {
      if (settled) return; // 이어진 뒤의 닫힘은 Connection 이 받는다
      settled = true;
      clearTimeout(timer);
      this.limiter.leave(ip);
    });
    ws.once('message', (data: RawData, binary: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      let hello: Record<string, unknown> | null = null;
      try {
        hello = binary ? null : (JSON.parse(data.toString()) as Record<string, unknown>);
      } catch {
        hello = null;
      }
      if (hello === null || typeof hello !== 'object' || hello['step'] !== 'Host 2') {
        this.limiter.leave(ip);
        return refuse(4001, '첫 글이 Host 2 가 아니다');
      }
      const character = this.o.verify(hello['credential']);
      if (character === null) {
        this.limiter.leave(ip);
        return refuse(4002, '토큰이 틀렸거나 만료되었다 — 다시 입장');
      }
      this.connections.get(character)?.close(4000, '같은 캐릭터가 다시 붙었다'); // 나중 접속이 이긴다
      const conn = new Connection(character, ws, ip, run, {
        gate: this.o.gate,
        limiter: this.limiter,
        detach: this.o.detach,
        rerouteMs: this.o.rerouteMs,
        trace: this.o.trace,
        log: this.o.log,
        closed: (c) => {
          if (this.connections.get(c.character) === c) this.connections.delete(c.character);
        },
      });
      this.connections.set(character, conn);
      this.o.trace({ flow: 9, step: 2, run, unit: '-', end: 'ok', account: character });
      void this.o
        .attach(character, this.o.gate, run) // 흐름 9 의 3 — 컨트롤 플레인에 묻는다(SessionRpc attach). 흔적은 받는 쪽이
        .then((to) => {
          if ('why' in to) {
            this.o.log(`${character} gateway 세션이 없다 — ${to.why}`);
            if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ step: 'Link 1', reject: { why: to.why } }));
            return conn.close(4002);
          }
          conn.open(to, hello!);
        })
        .catch((e: unknown) => {
          this.o.log(`${character} gateway attach 실패 — ${(e as Error).message}`);
          conn.close(1011, 'attach 실패');
        });
    });
  }

  closeAll(code: number): number {
    const all = [...this.connections.values()];
    for (const c of all) c.close(code, '게이트웨이가 내려간다');
    return all.length;
  }

  /** 듣기를 닫는다. 닫힘의 주고받음(close frame)이 한계(1 초) 안에 끝나지 않은 소켓은 끊는다. */
  async close(): Promise<void> {
    const server = this.server;
    const wss = this.wss;
    if (server === null || wss === null) return;
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeAllConnections();
    const late = await Promise.race([closed.then(() => false), new Promise<boolean>((r) => setTimeout(() => r(true), 1000).unref())]);
    if (late) {
      for (const ws of wss.clients) ws.terminate();
      await closed;
    }
    wss.close();
  }
}
