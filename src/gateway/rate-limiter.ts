// RateLimiter — 글의 크기와 빈도, 한 주소의 접속 수를 지킨다 (design/02-roles/gateway.md 의 RateLimiter, 흐름 9 의 1 · 11).

/** 접속 하나의 빈도를 재는 창 — Connection 이 든다. */
export interface Meter {
  start: number;
  n: number;
}

export class RateLimiter {
  // 데이터 — maxBytes · maxRate · ipLimit(불변). 열린 접속의 수와 버린 글의 수는 센 것
  readonly maxBytes: number;
  readonly maxRate: number;
  readonly ipLimit: number;
  dropped = 0;
  private readonly open = new Map<string, number>();
  private readonly now: () => number;

  constructor(o: { maxBytes: number; maxRate: number; ipLimit: number }, now: () => number = Date.now) {
    this.maxBytes = o.maxBytes;
    this.maxRate = o.maxRate;
    this.ipLimit = o.ipLimit;
    this.now = now;
  }

  /** admit — 흐름 9 의 1. 그 주소의 열린 접속이 한계 안이면 하나 세고 true. */
  admit(ip: string): boolean {
    const n = this.open.get(ip) ?? 0;
    if (n >= this.ipLimit) return false;
    this.open.set(ip, n + 1);
    return true;
  }

  /** 그 주소의 접속 하나가 닫혔다. */
  leave(ip: string): void {
    const n = (this.open.get(ip) ?? 0) - 1;
    if (n <= 0) this.open.delete(ip);
    else this.open.set(ip, n);
  }

  /** check — 흐름 9 의 11. 글 하나가 크기 · 빈도(1 초 창) 안인가. 아니면 버린 수를 센다. */
  check(bytes: number, meter: Meter): boolean {
    const t = this.now();
    if (t - meter.start >= 1000) {
      meter.start = t;
      meter.n = 0;
    }
    meter.n++;
    const ok = bytes <= this.maxBytes && meter.n <= this.maxRate;
    if (!ok) this.dropped++;
    return ok;
  }

  get connections(): number {
    let n = 0;
    for (const v of this.open.values()) n += v;
    return n;
  }
}
