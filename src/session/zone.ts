// Zone (값) — 설정의 줄 하나 (design/02-roles/session.md 의 Zone). name · dataset · capacity · spare 는 불변, closed 는 ZoneMap 이 고친다.

export interface Zone {
  readonly name: string;
  readonly dataset: string;
  /** 인스턴스 하나의 상한 — 잰 값 */
  readonly capacity: number;
  /** 미리 비워 두는 슬롯의 수 — 플릿의 Scaler 가 맞춘다 */
  readonly spare: number;
  closed: boolean;
}
