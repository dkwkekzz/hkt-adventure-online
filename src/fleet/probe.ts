// Probe — 엔진의 stdout 한 줄을 읽는다 (design/02-roles/fleet.md 의 Probe, 흐름 4 의 1). 정적.
// 읽는 것은 머리글 · status 의 머리와 접속 칸 · 멈춤 · 명령의 답뿐이다. 세계 안을 모른다.

import { ANSWER_HEAD, HALT_HEAD, HOST_HEAD, READY_HEAD, UNKNOWN_HEAD, linkedAccounts, readStatus } from '../protocol/engine';
import type { StatusLine } from '../protocol/engine';

export type ProbeRead =
  | { readonly kind: 'listening' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'status'; readonly status: StatusLine; readonly accounts: readonly string[] }
  | { readonly kind: 'halt' }
  | { readonly kind: 'other' };

export const Probe = {
  read(line: string): ProbeRead {
    if (line.startsWith(HOST_HEAD)) return { kind: 'listening' };
    if (line.startsWith(READY_HEAD)) return { kind: 'ready' };
    const status = readStatus(line);
    if (status !== null) return { kind: 'status', status, accounts: linkedAccounts(line) };
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
