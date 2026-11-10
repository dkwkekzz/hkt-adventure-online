// Ports — 샤드의 포트 (design/02-roles/fleet.md 의 Ports). 범위 안에서 센다. 포트를 들고 있지 않는다(엔진이 연다) —
// take 는 지금 열 수 있는지만 잠깐 열어 보고 닫는다. 다른 프로그램이 쓰는 포트를 배정하면 엔진의 dev 가 exit 2 로 끝나 그 샤드가 멈추기 때문이다.

import { createServer } from 'node:net';

const free = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const s = createServer();
    s.once('error', () => resolve(false));
    s.listen(port, () => s.close(() => resolve(true)));
  });

export class Ports {
  // 데이터 — range(불변) · used
  readonly range: readonly [number, number];
  readonly used = new Set<number>();

  constructor(range: readonly [number, number]) {
    this.range = range;
  }

  /** take — 쓰지 않고 지금 열 수 있는 포트 하나 또는 null. */
  async take(): Promise<number | null> {
    for (let p = this.range[0]; p <= this.range[1]; p++) {
      if (this.used.has(p)) continue;
      this.used.add(p); // 열어 보는 동안 다른 take 가 집지 않게
      if (await free(p)) return p;
      this.used.delete(p);
    }
    return null;
  }

  /** mark — 배정 표가 든 포트를 쓰는 것으로. 범위 밖이거나 이미 쓰면 false. */
  mark(port: number): boolean {
    if (port < this.range[0] || port > this.range[1] || this.used.has(port)) return false;
    this.used.add(port);
    return true;
  }

  free(port: number): void {
    this.used.delete(port);
  }
}
