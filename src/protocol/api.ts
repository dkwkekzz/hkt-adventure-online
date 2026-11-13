// Api 소켓 — 클라이언트(밖) → 앱. 로그인과 입장의 글 (design/README.md 의 Api, 흐름 2 · 3).
// 값만 건넌다. 게임의 글(엔진의 Link)은 여기를 지나지 않는다 — 클라이언트는 받은 게이트웨이의 주소로 붙는다(흐름 9).

/** 신원의 제공자. 1 차는 게스트 하나(design/00-feedback 1). */
export const PROVIDERS = ['guest'] as const;
export type Provider = (typeof PROVIDERS)[number];

/** `POST /login` 의 몸. 게스트의 subject 가 비면 새로 짓는다. */
export interface LoginRequest {
  readonly provider: string;
  readonly subject?: string;
}

/** `POST /login` 의 답 — 토큰과 제 주체(게스트가 다시 올 때 든다). */
export interface LoginAnswer {
  readonly token: string;
  readonly subject: string;
}

/** `POST /enter` 의 몸. */
export interface EnterRequest {
  readonly token: string;
}

/** `POST /enter` 의 답. page 는 뷰어 페이지(?token= · ?ws= 를 든다), gate 는 게이트웨이의 주소 — 다른 클라이언트도 이것 하나로 붙는다. */
export interface Address {
  readonly page: string;
  readonly gate: string;
}

/** 거절의 답. */
export interface Refusal {
  readonly why: string;
}
