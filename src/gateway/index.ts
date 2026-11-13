// 게이트웨이 gateway (design/02-roles/gateway.md). 밖에 내보내는 것은 openGateway 하나 — 객체는 소켓(protocol/gateway.ts) 너머다.
// 토큰은 앱이 준 verify 로만, 컨트롤 플레인에는 앱이 준 attach · detach · report(SessionRpc)로만 닿는다.
// 간격(흐름 5 의 B — Keepalive.ping · GateReporter.report)은 여기서 돈다: Clock 은 플릿 모듈의 개념이라 모듈 경계 안에 같은 간격을 든다.

import { randomBytes } from 'node:crypto';
import type { GatewayOptions, GatewaySocket } from '../protocol/gateway';
import { Acceptor } from './acceptor';
import { GateReporter } from './gate-reporter';
import { Keepalive } from './keepalive';
import { RateLimiter } from './rate-limiter';

const fresh = (): string => randomBytes(4).toString('hex');

/** Service.start(흐름 1 의 1) — 개념들을 만든다. 듣는 것은 listen. */
export function openGateway(o: GatewayOptions): GatewaySocket {
  const c = o.config;
  const limiter = new RateLimiter(c);
  const keepalive = new Keepalive(c.pongMs);
  const acceptor = new Acceptor({ gate: o.name, verify: o.verify, attach: o.attach, detach: o.detach, limiter, helloMs: c.helloMs, rerouteMs: c.rerouteMs, trace: o.trace, log: o.log, fresh });
  let reporter: GateReporter | null = null;
  let timer: NodeJS.Timeout | null = null;
  let port = 0;
  /** GateReporter.report 와 그 흔적 — 단위는 `-`(게이트웨이는 인스턴스가 아니다), 수는 counts 에. */
  const mark = (flow: number, step: number, run: string): void => {
    const r = reporter!.report(acceptor.connections.values());
    o.trace({ flow, step, run, unit: '-', end: 'ok', counts: { connections: r.connections.length, dropped: limiter.dropped } });
  };
  const tick = (): void => {
    const run = fresh();
    let closed = 0;
    for (const conn of [...acceptor.connections.values()]) if (!keepalive.ping(conn)) closed++;
    o.trace({ flow: 5, step: 5, run, unit: '-', end: 'ok', counts: { connections: acceptor.connections.size, closed } }); // Keepalive.ping
    mark(5, 6, run); // GateReporter.report
  };
  return {
    get port() {
      return port;
    },
    get address() {
      return reporter?.address ?? o.address;
    },
    async listen(run: string): Promise<void> {
      port = await acceptor.listen(c.port);
      o.trace({ flow: 1, step: 4, run, unit: '-', end: 'wait', counts: { port } }); // Acceptor.listen — 클라이언트 ◇
      reporter = new GateReporter(o.name, o.address === '' ? `ws://localhost:${port}` : o.address, o.report);
      mark(1, 5, run);
      timer = setInterval(tick, o.clockMs);
      timer.unref();
    },
    async close(run: string): Promise<void> {
      if (timer !== null) clearInterval(timer);
      timer = null;
      if (reporter !== null) {
        reporter.closing = true; // 새 입장이 이 게이트웨이를 받지 않는다
        mark(7, 7, run);
      }
      const n = acceptor.closeAll(1001);
      o.trace({ flow: 7, step: 8, run, unit: '-', end: 'ok', counts: { connections: n } }); // Connection.close × 접속
      await acceptor.close();
    },
  };
}
