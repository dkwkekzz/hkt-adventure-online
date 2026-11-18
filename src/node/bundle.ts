// bundleViewer — API 서버의 시작에 뷰어를 한 번 묶는다(흐름 1 의 2 — Spawner.bundle). 묶지 못하면 던진다(시작 거부).

import type { TraceFn } from '../protocol/observe';
import { Spawner } from './spawner';

export async function bundleViewer(engineDir: string, outfile: string, trace: TraceFn, run: string, log: (line: string) => void): Promise<void> {
  const job = Spawner.bundle(engineDir, outfile);
  const errors: string[] = [];
  job.onLine((_s, line) => errors.push(line));
  const code = await job.exited;
  trace({ flow: 1, step: 2, run, unit: '-', end: code === 0 ? 'ok' : 'failed', counts: { exit: code } }); // Spawner.bundle
  if (code !== 0) throw new Error(`뷰어를 묶지 못했다 — exit ${code}${errors.length === 0 ? '' : ` — ${errors.slice(-3).join(' / ')}`}`);
  log(`fleet 뷰어를 묶었다 — ${outfile}`);
}
