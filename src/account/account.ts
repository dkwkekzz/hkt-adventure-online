// Account (값) — 엔진의 host.Account.id 와 같은 글 (design/02-roles/account.md 의 Account). 불변.
// 공백 · `.` 이 없고 64 자 안 — 엔진의 Console 이 공백으로 글을 나누고 토큰이 `.` 으로 나뉘기 때문이다(흐름 2 규칙).

export interface Account {
  readonly id: string;
}

export const ACCOUNT_ID = /^[^\s.]{1,64}$/;
