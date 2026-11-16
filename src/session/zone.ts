// Zone (값) — 설정의 줄 하나 (design/02-roles/session.md 의 Zone). name · dataset · capacity 는 불변, closed 는 ZoneMap 이 고친다.
// spare(예비 용량)는 Scaler 와 함께 선다(plan 07).

export interface Zone {
  readonly name: string;
  readonly dataset: string;
  /** 인스턴스 하나의 상한 — 잰 값 */
  readonly capacity: number;
  closed: boolean;
}
