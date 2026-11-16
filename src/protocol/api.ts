// Api 소켓 — 클라이언트(밖) → 앱. 로그인 · 캐릭터 · 입장의 글 (design/README.md 의 Api, 흐름 2 · 8 · 3).
//   POST /login {provider, subject?} → {token(계정의 토큰), subject}
//   POST /characters {token} → {characters} · /create {token, name} → {character} · /choose {token, character} → {token(캐릭터의 토큰)} · /delete {token, character} → {deleted}
//   POST /enter {token(캐릭터의 토큰)} → {page, gate} · {wait}
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

/** 캐릭터 하나 — 클라이언트가 보는 것(계정은 싣지 않는다). */
export interface CharacterView {
  readonly id: string;
  readonly name: string;
}

/** `POST /characters` 의 몸 · `/create` · `/choose` · `/delete` 의 몸. token 은 계정의 토큰. */
export interface CharactersRequest {
  readonly token: string;
  /** create 의 이름 */
  readonly name?: string;
  /** choose · delete 의 Character.id */
  readonly character?: string;
}

export interface CharactersAnswer {
  readonly characters: readonly CharacterView[];
}
export interface CreateAnswer {
  readonly character: CharacterView;
}
/** choose 의 답 — 캐릭터의 토큰(수명은 짧게). 입장 · 게이트웨이 · 호스트가 이것을 받는다. */
export interface ChooseAnswer {
  readonly token: string;
}
export interface DeleteAnswer {
  readonly deleted: string;
}

/** `POST /enter` 의 몸 — 캐릭터의 토큰. */
export interface EnterRequest {
  readonly token: string;
}

/** `POST /enter` 의 답. page 는 뷰어 페이지(?token= · ?ws= 를 든다), gate 는 게이트웨이의 주소 — 다른 클라이언트도 이것 하나로 붙는다. */
export interface Address {
  readonly page: string;
  readonly gate: string;
}

/** `POST /enter` 의 답 — 줄에 섰다. 잠시 뒤 다시 묻는다(흐름 3 의 21). */
export interface Wait {
  readonly wait: number;
}

/** 거절의 답. */
export interface Refusal {
  readonly why: string;
}
