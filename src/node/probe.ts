// Probe — 엔진의 stdout 한 줄을 읽는다 (design/02-roles/node.md 의 Probe, 흐름 4 의 1). 정적.
// 읽는 것은 머리글 · status 의 머리와 접속 칸 · 지연 · 떠남 줄 · backup 끝 줄 · 멈춤 · 명령의 답뿐이다. 세계 안을 모른다.

import { ANSWER_HEAD, BACKUP_DONE, BACKUP_FAILED, DEPART_LINE, DEPART_NOBODY, HALT_HEAD, HOST_HEAD, READY_HEAD, UNKNOWN_HEAD, linkedAccounts, readStatus } from '../protocol/engine';
import type { StatusLine } from '../protocol/engine';

export type ProbeRead =
  | { readonly kind: 'listening' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'status'; readonly status: StatusLine; readonly accounts: readonly string[] }
  /** 떠남 줄 — account 는 그 묶음을 맡은 엔진의 계정(Character.id), 맡은 이가 없으면 null. to 는 `<존>` 또는 `<존>@<공간>` 의 글 그대로. */
  | { readonly kind: 'handoff'; readonly account: string | null; readonly to: string }
  /** backup 끝 줄 — 베낀 자리와 그 저장의 now. 베끼지 못했으면 error 에 그 까닭(now 는 null). */
  | { readonly kind: 'backed'; readonly dir: string; readonly now: number | null; readonly error: string | null }
  | { readonly kind: 'halt' }
  | { readonly kind: 'other' };

export const Probe = {
  read(line: string): ProbeRead {
    if (line.startsWith(HOST_HEAD)) return { kind: 'listening' };
    if (line.startsWith(READY_HEAD)) return { kind: 'ready' };
    const status = readStatus(line);
    if (status !== null) return { kind: 'status', status, accounts: linkedAccounts(line) };
    const depart = DEPART_LINE.exec(line);
    if (depart !== null) return { kind: 'handoff', account: depart[1] === DEPART_NOBODY ? null : depart[1]!, to: depart[2]! };
    const backed = BACKUP_DONE.exec(line);
    if (backed !== null) return { kind: 'backed', dir: backed[1]!, now: Number(backed[2]), error: null };
    const failed = BACKUP_FAILED.exec(line);
    if (failed !== null) return { kind: 'backed', dir: failed[1]!, now: null, error: failed[2]! };
    if (line.startsWith(HALT_HEAD)) return { kind: 'halt' };
    return { kind: 'other' };
  },

  /** answers — 그 줄이 그 Console 명령(글의 첫 낱말)의 답인가. 모르는 명령의 답도 답이다. */
  answers(command: string, line: string): boolean {
    if (line.startsWith(UNKNOWN_HEAD)) return true;
    const head = (ANSWER_HEAD as Record<string, RegExp | undefined>)[command];
    return head !== undefined && head.test(line);
  },
};
