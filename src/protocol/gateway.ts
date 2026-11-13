// 게이트웨이 소켓 — 앱 → 게이트웨이 모듈 (design/02-roles/gateway.md). 밖에 내보내는 것은 openGateway 하나 — 객체는 이 모양 너머다.

import type { TraceFn } from './observe';
import type { Attach, Detach, Report } from './session';

/** 설정의 `gateway` — 포트와 한계 · 주기. */
export interface GatewayConfig {
  /** 클라이언트가 붙는 포트. 0 이면 빈 포트 */
  readonly port: number;
  /** 첫 글(`Host 2`)을 기다리는 한계 */
  readonly helloMs: number;
  /** 호스트 쪽이 닫힌 뒤 다른 호스트로 잇기를 기다리는 한계 — 지나면 닫는다(1001) */
  readonly rerouteMs: number;
  /** ping 의 답을 기다리는 한계 */
  readonly pongMs: number;
  /** 글 하나의 크기(바이트) */
  readonly maxBytes: number;
  /** 접속 하나가 초마다 보내는 글 */
  readonly maxRate: number;
  /** 한 주소의 열린 접속 */
  readonly ipLimit: number;
}

export interface GatewayOptions {
  readonly config: GatewayConfig;
  /** 이 게이트웨이의 이름 */
  readonly name: string;
  /** 밖에서 보는 주소 — `ws(s)://…`. 비면 listen 뒤 `ws://localhost:<port>` */
  readonly address: string;
  /** 간격 — 흐름 5 의 B(Keepalive.ping · GateReporter.report) */
  readonly clockMs: number;
  /** 캐릭터의 토큰 → Character.id, 틀리면 null — 앱이 준 Signer.verify */
  readonly verify: (token: unknown) => string | null;
  readonly attach: Attach;
  readonly detach: Detach;
  readonly report: Report;
  readonly trace: TraceFn;
  readonly log: (line: string) => void;
}

export interface GatewaySocket {
  /** 흐름 1 의 4 · 5 — 소켓을 듣고 자기를 알린다. 간격을 돌린다. */
  listen(run: string): Promise<void>;
  /** 흐름 7 의 7 · 8 — 내려간다고 알리고 접속을 전부 닫는다(1001). */
  close(run: string): Promise<void>;
  /** 듣는 포트 · 밖에서 보는 주소 — listen 뒤 */
  readonly port: number;
  readonly address: string;
}
