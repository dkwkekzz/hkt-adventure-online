// Console — 호스트에 글 한 줄을 쓰고 답을 받는다 (design/02-roles/node.md 의 Console, 흐름 3 의 17 · 5 의 1 · 9 의 7 · 10 의 5 · 6 의 host).
// 답은 Runner.line 이 넘긴 줄 가운데 그 명령의 답(Probe.answers)이다 — 머리글 뒤의 줄만. 한계 안에 없으면 null.

import type { Process } from './process';
import { Probe } from './probe';

interface Waiter {
  readonly command: string;
  readonly resolve: (answer: string | null) => void;
}

export class Console {
  // 데이터 — waiting(인스턴스마다 답을 기다리는 명령 줄) · limitMs(설정의 commandLimitMs)
  readonly waiting = new Map<string, Waiter[]>();
  readonly limitMs: number;
  private readonly hostOf: (instance: string) => Process | null;

  /** hostOf — 그 인스턴스의 호스트(Runner 가 든다). */
  constructor(limitMs: number, hostOf: (instance: string) => Process | null) {
    this.limitMs = limitMs;
    this.hostOf = hostOf;
  }

  /** command — 그 호스트의 stdin 에 글 한 줄을 쓰고 그 답 한 줄. 내려가 있거나 한계 안에 답이 없으면 null. */
  command(instance: string, line: string): Promise<string | null> {
    const host = this.hostOf(instance);
    if (host === null || !host.alive) return Promise.resolve(null);
    const name = line.trim().split(/\s+/)[0] ?? '';
    const queue = this.waiting.get(instance) ?? [];
    this.waiting.set(instance, queue);
    return new Promise((resolve) => {
      const waiter: Waiter = {
        command: name,
        resolve: (answer) => {
          clearTimeout(timer);
          resolve(answer);
        },
      };
      const timer = setTimeout(() => {
        const i = queue.indexOf(waiter);
        if (i >= 0) queue.splice(i, 1);
        resolve(null);
      }, this.limitMs);
      queue.push(waiter);
      host.write(line.trim());
    });
  }

  /** answer — Runner.line 이 머리글 뒤의 줄을 넘긴다. 맨 앞에서 기다리는 명령의 답이면 그것에 주고 true. */
  answer(instance: string, text: string): boolean {
    const head = this.waiting.get(instance)?.[0];
    if (head === undefined || !Probe.answers(head.command, text)) return false;
    this.waiting.get(instance)!.shift();
    head.resolve(text);
    return true;
  }

  /** drop — 호스트가 끝났다. 기다리던 명령은 답 없음(null). */
  drop(instance: string): void {
    for (const w of this.waiting.get(instance)?.splice(0) ?? []) w.resolve(null);
    this.waiting.delete(instance);
  }
}
