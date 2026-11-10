// Assignment — 세계의 자리 표: 세계의 이름 → {dataset, storeDir, port} (design/02-roles/fleet.md 의 Assignment). 값은 저장장치의 `assignment` 자리에.

import type { LedgerSocket } from '../protocol/vault';

export interface Row {
  readonly dataset: string;
  readonly storeDir: string;
  /** null 이면 포트를 비웠다(revoke-port) — 다음 입장이 새로 받는다. */
  port: number | null;
}

export class Assignment {
  // 데이터 — rows · ledger(참조)
  readonly rows: Map<string, Row>;
  readonly ledger: LedgerSocket;

  constructor(ledger: LedgerSocket) {
    this.ledger = ledger;
    const saved = ledger.load('assignment') as { rows?: Record<string, Row> } | null;
    this.rows = new Map(Object.entries(saved?.rows ?? {}).map(([a, r]) => [a, { ...r }]));
  }

  get(world: string): Row | null {
    return this.rows.get(world) ?? null;
  }

  put(world: string, row: Row): void {
    this.rows.set(world, row);
    this.save();
  }

  remove(world: string): void {
    this.rows.delete(world);
    this.save();
  }

  all(): [string, Row][] {
    return [...this.rows];
  }

  save(): void {
    this.ledger.save('assignment', { rows: Object.fromEntries(this.rows) });
  }
}
