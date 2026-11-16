// Queue — 슬롯을 기다리는 줄을 든다 (design/02-roles/session.md 의 Queue, 흐름 3 의 4 · 20 · 5 의 14 · 11 의 6). 존마다 하나.

export interface Waiter {
  readonly character: string;
  readonly account: string;
  readonly name: string;
  readonly build: string;
  /** 마지막으로 물은 때(ms) */
  asked: number;
}

export class Queue {
  // 데이터 — zone(불변) · waiting
  readonly zone: string;
  readonly waiting: Waiter[] = [];
  private readonly now: () => number;

  constructor(zone: string, now: () => number = Date.now) {
    this.zone = zone;
    this.now = now;
  }

  /** push — 줄 끝에 세우고 순번(1 부터). 이미 서 있으면 그 순번 — 물은 때를 고친다. */
  push(character: string, account: string, name: string, build: string): number {
    const at = this.position(character);
    if (at !== null) return at;
    this.waiting.push({ character, account, name, build, asked: this.now() });
    return this.waiting.length;
  }

  /** position — 순번(없으면 null). 물은 때를 고친다. */
  position(character: string): number | null {
    const i = this.waiting.findIndex((w) => w.character === character);
    if (i < 0) return null;
    this.waiting[i]!.asked = this.now();
    return i + 1;
  }

  /** next — 그 빌드의 사람을 앞에서부터 하나 꺼낸다. */
  next(build: string): Waiter | null {
    const i = this.waiting.findIndex((w) => w.build === build);
    return i < 0 ? null : this.waiting.splice(i, 1)[0]!;
  }

  drop(character: string): boolean {
    const i = this.waiting.findIndex((w) => w.character === character);
    if (i >= 0) this.waiting.splice(i, 1);
    return i >= 0;
  }

  /** stale — before 뒤로 묻지 않은 사람들을 줄에서 빼고 준다. */
  stale(before: number): Waiter[] {
    const gone = this.waiting.filter((w) => w.asked < before);
    for (const w of gone) this.drop(w.character);
    return gone;
  }

  /** 줄에 선 빌드들 — 앞에서부터, 겹치지 않게. */
  builds(): string[] {
    return [...new Set(this.waiting.map((w) => w.build))];
  }
}
