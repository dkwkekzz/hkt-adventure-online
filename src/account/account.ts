// Account (값) — 밖의 신원 하나가 바뀐 것 (design/02-roles/account.md 의 Account). 불변. id 는 `a` 로 시작(Directory.resolve).
// ACCOUNT_ID 는 토큰에 실리는 id 의 모양 — 계정 · 캐릭터 · NPC 계정 모두. 공백 · `.` 이 없고 64 자 안(엔진의 Gate 와 같은 셈 —
// 엔진의 Console 이 공백으로 글을 나누고 토큰이 `.` 으로 나뉘기 때문이다).

export interface Account {
  readonly id: string;
}

export const ACCOUNT_ID = /^[^\s.]{1,64}$/;
