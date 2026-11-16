// Session (값) — 캐릭터 하나가 인스턴스 하나에 배정되어 있는 것 (design/02-roles/session.md 의 Session). 스토리지에 두지 않는다.
// id · character · account · name · build 는 불변. instance · gate · state · until 은 Sessions 가 고친다.

export type SessionState = 'pending' | 'active' | 'grace';

export interface Session {
  /** 잡을 때 짓는 이름 — 흔적의 session */
  readonly id: string;
  readonly character: string;
  /** Account.id — 흔적에는 가명(who)으로만 */
  readonly account: string;
  /** 캐릭터 이름 — 흔적의 name */
  readonly name: string;
  readonly build: string;
  instance: string;
  /** 옮겨 갈 곳(흐름 10 — plan 07) */
  to: string | null;
  /** 이어진 게이트웨이 — pending 이면 null */
  gate: string | null;
  state: SessionState;
  /** 만료(ms) — pending · grace 일 때만 */
  until: number;
}
