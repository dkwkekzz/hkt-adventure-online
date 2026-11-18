// Router — 게이트웨이에 접속의 뒤를 바꾸거나 닫으라고 알린다 (design/02-roles/session.md 의 Router, 흐름 3 의 3 · 10 의 11 · 12 의 5).

import type { Attached } from '../protocol/session';
import type { Session } from './session';

export class Router {
  // 데이터 — rpc(SessionRpc kick · reroute — 앱이 준다)
  readonly kickRpc: (gate: string, character: string, code: number, run: string) => void;
  readonly rerouteRpc: (gate: string, character: string, to: Attached, run: string) => void;

  constructor(kick: Router['kickRpc'], reroute: Router['rerouteRpc']) {
    this.kickRpc = kick;
    this.rerouteRpc = reroute;
  }

  /** kick — 그 세션의 게이트웨이에 그 접속을 그 코드로 닫게 한다. 게이트웨이를 아직 모르면(pending) 보내지 않는다 — 보냈으면 true. */
  kick(session: Session, code: number, run: string): boolean {
    if (session.gate === null) return false;
    this.kickRpc(session.gate, session.character, code, run);
    return true;
  }

  /** reroute — 그 세션의 게이트웨이에 새 호스트의 주소와 새 토큰을 보낸다(흐름 10 의 11). 이어진 게이트웨이가 없으면(pending · grace) 보내지 않는다 — 보냈으면 true. */
  reroute(session: Session, to: Attached, run: string): boolean {
    if (session.gate === null || session.state !== 'active') return false;
    this.rerouteRpc(session.gate, session.character, to, run);
    return true;
  }
}
