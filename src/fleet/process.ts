// Process — 엔진 프로세스 하나(호스트 또는 에이전트) (design/02-roles/fleet.md 의 Process).
// Spawner 가 만든다. 자식 프로세스를 직접 만들지 않는다 — 그것은 Spawner 하나의 일이다(경계 규칙 E). 여기는 줄을 나누고 쓰고 끝을 듣는다.

import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

/** Spawner 가 넘기는 자식 — node:child_process 의 ChildProcess 가운데 쓰는 칸만. */
export interface Child {
  readonly pid?: number | undefined;
  readonly stdin: Writable | null;
  readonly stdout: Readable | null;
  readonly stderr: Readable | null;
  kill(signal?: NodeJS.Signals): boolean;
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  once(event: 'error', listener: (error: Error) => void): unknown;
}

export type Stream = 'stdout' | 'stderr';
/** 신호로 끝난 프로세스의 종료 코드 — 0 · 2 와 갈린다. */
export const EXIT_SIGNAL = -1;

export class Process {
  // 데이터 — pid · exit
  readonly pid: number;
  exit: number | null = null;
  private readonly child: Child;
  private readonly lineListeners: ((stream: Stream, line: string) => void)[] = [];
  private readonly exitListeners: ((code: number) => void)[] = [];
  readonly exited: Promise<number>;

  constructor(child: Child) {
    this.child = child;
    this.pid = child.pid ?? -1;
    child.stdin?.on('error', () => {}); // 끝난 프로세스에 쓰면 EPIPE — 끝은 exit 이 알린다
    for (const stream of ['stdout', 'stderr'] as const) {
      const from = child[stream];
      if (from === null) continue;
      createInterface({ input: from }).on('line', (line) => {
        for (const l of this.lineListeners) l(stream, line);
      });
    }
    this.exited = new Promise((resolve) => {
      const done = (code: number): void => {
        if (this.exit !== null) return;
        this.exit = code;
        // 남은 줄이 다 읽힌 뒤에 알린다
        setImmediate(() => {
          for (const l of this.exitListeners) l(code);
          resolve(code);
        });
      };
      child.once('exit', (code, signal) => done(code ?? (signal === null ? 0 : EXIT_SIGNAL)));
      // 띄우지도 못했다(실행 파일이 없다 등) — exit 이 오지 않는다. 시작 실패와 같은 길로
      child.once('error', (e) => {
        for (const l of this.lineListeners) l('stderr', `띄우지 못했다 — ${e.message}`);
        done(EXIT_SIGNAL);
      });
    });
  }

  get alive(): boolean {
    return this.exit === null;
  }

  /** write — 글 한 줄(줄바꿈은 여기서 붙인다). */
  write(line: string): void {
    if (this.alive) this.child.stdin?.write(`${line}\n`);
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): void {
    if (this.alive) this.child.kill(signal);
  }

  onLine(listener: (stream: Stream, line: string) => void): void {
    this.lineListeners.push(listener);
  }

  onExit(listener: (code: number) => void): void {
    this.exitListeners.push(listener);
  }
}
