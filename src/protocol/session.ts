// SessionRpc — API 서버 · 게이트웨이 ↔ 컨트롤 플레인 (design/README.md 의 연결 여덟, design/02-roles/gateway.md · session.md 의 소켓).
// 개발의 main 에서는 함수 부름이다 — 앱이 이어 준다. 지금 받는 쪽은 세션 모듈(plan 05) 전이라 함대가 대신 든다.

/** attach 의 답 — 그 캐릭터가 이어질 호스트와, 호스트에 줄 새 토큰(흐름 9 의 9). 호스트의 주소는 클라이언트에게 가지 않는다. */
export interface Attached {
  readonly instance: string;
  /** 호스트의 소켓 주소 — 내부망의 것(`ws://<노드>:<포트>`) */
  readonly address: string;
  readonly token: string;
}

/** 세션이 없다 · 이을 수 없다 — 게이트웨이가 4002 로 닫는다. */
export interface Unattached {
  readonly why: string;
}

/** 게이트웨이 → 컨트롤 플레인: 그 캐릭터의 세션 — 흐름 9 의 3 ~ 9. run 은 그 접속의 것. */
export type Attach = (character: string, gate: string, run: string) => Promise<Attached | Unattached>;
/** 게이트웨이 → 컨트롤 플레인: 그 캐릭터의 접속이 닫혔다 — 흐름 11 의 1 → 2. */
export type Detach = (character: string, gate: string, run: string) => void;

/** GateReporter.report 의 글 — 흐름 1 의 5 · 5 의 6 · 7 의 7. */
export interface GateReport {
  readonly name: string;
  readonly address: string;
  readonly closing: boolean;
  readonly connections: readonly { readonly character: string; readonly instance: string | null }[];
}
export type Report = (report: GateReport) => void;
