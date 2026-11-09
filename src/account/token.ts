// Token (값) — `hkt1.<Account.id>.<exp>.<sig>` (design/02-roles/account.md 의 Token). sig 는 `hkt1.<id>.<exp>` 의 HMAC-SHA256 을 base64url 로.
// 모양의 주인은 엔진의 Gate(검증)다 — 엔진 host.md 의 Gate 줄 · ONLINE.md §1.3. 여기는 그 모양으로 낸다.

export type Token = string;

export const TOKEN_HEAD = 'hkt1';
