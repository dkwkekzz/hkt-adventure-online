// Router — 게이트웨이에 접속의 뒤를 바꾸거나 닫으라고 알린다 (design/02-roles/session.md 의 Router).
// 지금은 kick 하나 — Admission 이 같은 계정의 다른 캐릭터를 내보낼 때. reroute(흐름 10 · 12)는 Mover 와 함께 선다(plan 07).

import type { Session } from './session';

export class Router {
  // 데이터 — rpc(SessionRpc kick — 앱이 준다)
  readonly rpc: (gate: string, character: string, code: number, run: string) => void;

  constructor(rpc: (gate: string, character: string, code: number, run: string) => void) {
    this.rpc = rpc;
  }

  /** kick — 그 세션의 게이트웨이에 그 접속을 그 코드로 닫게 한다. 게이트웨이를 아직 모르면(pending) 보내지 않는다 — 보냈으면 true. */
  kick(session: Session, code: number, run: string): boolean {
    if (session.gate === null) return false;
    this.rpc(session.gate, session.character, code, run);
    return true;
  }
}
