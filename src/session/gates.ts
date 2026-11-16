// Gates — 살아 있는 게이트웨이를 든다 (design/02-roles/session.md 의 Gates, 흐름 3 의 8 · 5 의 8 · 11).

export interface GateRow {
  readonly address: string;
  seen: number;
  closing: boolean;
}

export class Gates {
  // 데이터 — rows
  readonly rows = new Map<string, GateRow>();
  private readonly limitMs: number;
  private readonly now: () => number;
  private turn = 0;

  constructor(gateLimitMs: number, now: () => number = Date.now) {
    this.limitMs = gateLimitMs;
    this.now = now;
  }

  /** seen — 보고가 온 때를 적는다. */
  seen(gate: string, address: string, closing: boolean): void {
    this.rows.set(gate, { address, seen: this.now(), closing });
  }

  /** pick — 살아 있고 closing 이 아닌 게이트웨이 하나. 여럿이면 차례로 돌린다. 없으면 null. */
  pick(): { readonly name: string; readonly address: string } | null {
    const live = [...this.rows].filter(([, r]) => !r.closing && r.seen > this.now() - this.limitMs);
    if (live.length === 0) return null;
    const [name, r] = live[this.turn++ % live.length]!;
    return { name, address: r.address };
  }

  /** dead — 보고가 한계를 넘겨 끊긴 것들. 표에서 뺀다. */
  dead(): string[] {
    const before = this.now() - this.limitMs;
    const out = [...this.rows].filter(([, r]) => r.seen <= before).map(([name]) => name);
    for (const name of out) this.rows.delete(name);
    return out;
  }
}
