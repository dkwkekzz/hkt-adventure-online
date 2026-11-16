// Token (값) — `hkt1.<id>.<exp>.<sig>` (design/02-roles/account.md 의 Token). sig 는 `hkt1.<id>.<exp>` 의 HMAC-SHA256 을 base64url 로.
// 모양의 주인은 엔진의 Gate(검증)다 — 엔진 host.md 의 Gate 줄 · ONLINE.md §1.3. 여기는 그 모양으로 낸다.
// id 의 머리 글자가 어느 토큰인지 말한다 — `a` 계정(Api 에만) · `p` 캐릭터(입장 · 게이트웨이 · 호스트) · `o` 운영자(Operator 에만). 그 밖(NPC 계정)은 엔진에만 간다.

export type Token = string;

export const TOKEN_HEAD = 'hkt1';
export const ACCOUNT_HEAD = 'a';
export const CHARACTER_HEAD = 'p';

export type TokenKind = 'account' | 'character' | 'operator' | 'other';

/** verify 가 준 id → 어느 토큰의 것인가. 부른 자리가 맞는 것만 받는다. */
export const kindOf = (id: string): TokenKind =>
  /^a[0-9a-f]{12}$/.test(id) ? 'account' : /^p[0-9a-f]{12}$/.test(id) ? 'character' : id.startsWith('o') ? 'operator' : 'other';
