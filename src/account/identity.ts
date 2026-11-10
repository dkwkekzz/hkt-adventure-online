// Identity (값) — 로그인(밖)이 준 신원 (design/02-roles/account.md 의 Identity). 불변. key 는 `provider:subject`.

export interface Identity {
  readonly provider: string;
  readonly subject: string;
}

export const keyOf = (identity: Identity): string => `${identity.provider}:${identity.subject}`;
