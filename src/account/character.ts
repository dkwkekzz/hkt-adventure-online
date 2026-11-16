// Character (값) — 계정이 든 것 하나 (design/02-roles/account.md 의 Character). 불변.
// id 는 `p` 로 시작 — 엔진의 host.Account.id 와 같은 글이다(엔진에게는 이것이 계정 — 캐릭터마다 사람의 묶음 하나).

export interface Character {
  readonly id: string;
  readonly name: string;
  readonly account: string;
}

/** 이름 — 앞뒤 공백을 뺀 1 ~ 24 자, 제어 글자 없이. */
export const nameOf = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  if ([...name].length < 1 || [...name].length > 24 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  return name;
};
