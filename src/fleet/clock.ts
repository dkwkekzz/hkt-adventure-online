// Clock — 함대의 박자 (design/02-roles/fleet.md 의 Clock, 흐름 5 의 트리거). 앞의 tick 이 끝나기 전에는 다음을 부르지 않는다.

export class Clock {
  // 데이터 — interval(불변, ms) · timer
  readonly interval: number;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(interval: number) {
    this.interval = interval;
  }

  run(tick: () => Promise<void>): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      if (this.busy) return;
      this.busy = true;
      tick()
        .catch((e: unknown) => console.error(`[clock] ${(e as Error).message}`))
        .finally(() => (this.busy = false));
    }, this.interval);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}
