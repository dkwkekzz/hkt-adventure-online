// Engine 소켓 — 함대 → 엔진(밖). 엔진이 밖에 내놓은 면을 타입과 데이터로 베낀 것 (엔진 web/ONLINE.md §1 · §3.1).
// 엔진의 코드를 import 하지 않는다 — 프로세스 경계다. 엔진의 커밋은 저장소 뿌리의 engine.lock 이 핀하고, 그 커밋의 사실만 여기 적는다.
// 엔진을 올리면 ONLINE.md §1 을 다시 읽고 이 파일을 같은 커밋에서 고친다.

/** 엔진 체크아웃 안의 앱 자리 — `<engineDir>/web` 에서 돈다. npm 을 사이에 두지 않고 tsx 로 바로(신호 · stdin 이 그대로 닿는다). */
export const ENGINE_WEB = 'web';
export const ENGINE_TSX = 'node_modules/.bin/tsx';
/** `npm run dev` 의 진입점 — 세계 + 뷰어(페이지 · 묶음 · /assets/ · 소켓이 한 포트). */
export const ENGINE_DEV = 'apps/server/dev.ts';
/** `npm run agent` 의 진입점 — 주체 프로세스. */
export const ENGINE_AGENT = 'apps/agent/main.ts';
/** 서명 키의 환경변수 — 엔진의 Gate 가 이것으로 토큰을 검증한다(stage 1). 서비스의 Signer 도 같은 키를 든다. */
export const AUTH_ENV = 'HOST_AUTH_KEY';

/** dev 의 인자 — 엔진의 parseHostArgs · dev.ts 가 받는 것 가운데 서비스가 쓰는 것만. */
export interface DevArgs {
  readonly dataset: string;
  readonly port: number;
  readonly store: string;
  readonly beat: number;
  readonly sparse: number;
  readonly keymap: string | null;
  /** `--grant account=b1,b2` — NPC 묶음. 머리글과 같은 박자에 명부에 든다. */
  readonly grant: { readonly account: string; readonly bodies: readonly string[] } | null;
}

export function devArgv(a: DevArgs): string[] {
  const argv = [ENGINE_DEV, a.dataset, '--port', String(a.port), '--store', a.store, '--beat', String(a.beat), '--sparse', String(a.sparse)];
  if (a.keymap !== null) argv.push('--keymap', a.keymap);
  if (a.grant !== null && a.grant.bodies.length > 0) argv.push('--grant', `${a.grant.account}=${a.grant.bodies.join(',')}`);
  return argv;
}

/** agent 의 인자 — `--brain fsm` 은 데이터셋의 두뇌 값으로 NPC 를 돈다. */
export interface AgentArgs {
  readonly url: string;
  readonly account: string;
  readonly token: string;
}

export function agentArgv(a: AgentArgs): string[] {
  return [ENGINE_AGENT, '--url', a.url, '--account', a.account, '--token', a.token, '--brain', 'fsm'];
}

/** stdout 의 머리글 첫 줄 — `host <file> · ws://localhost:<port> · …`. 찍히면 소켓이 듣는다. */
export const HOST_HEAD = 'host ';
/**
 * dev 가 뜬 뒤의 마지막 줄 — `뷰어: http://localhost:<port>/ …`. 머리글 · status · `--grant` 의 답 글 뒤에 같은 박자로 찍힌다.
 * 서비스는 이것을 준비 신호로 읽는다 — 이 뒤의 줄만 명령의 답이다(앞의 grant · status 글을 답으로 잘못 읽지 않는다).
 */
export const READY_HEAD = '뷰어: ';
/** 멈출 때의 마지막 글 — `멈춤 — beats N · now M · 저장 <dir>`. 뒤에 exit 0. */
export const HALT_HEAD = '멈춤 — ';
/** 데이터셋 거부 · 시작 실패의 종료 코드. 같은 인자로 다시 띄워도 같다. */
export const EXIT_REFUSED = 2;
/** 저장된 세계에서 이어갈 때의 머리글 둘째 줄. */
export const RESUMED_HEAD = '저장된 세계에서 이어간다';

/** Console 명령 여덟 — 엔진 protocol/console.ts 의 CONSOLE_COMMANDS. */
export const CONSOLE_COMMANDS = ['pause', 'resume', 'save', 'step', 'stop', 'grant', 'revoke', 'status'] as const;
export type ConsoleCommand = (typeof CONSOLE_COMMANDS)[number];

/** status 답 글의 머리 — 엔진 protocol/console.ts 의 STATUS_HEAD 그대로. */
export const STATUS_HEAD = /^beats (\d+) · now (\d+) · (돈다|멈춤) · /;

export interface StatusLine {
  readonly beats: number;
  readonly now: number;
  readonly paused: boolean;
  readonly text: string;
}

/** 엔진 protocol/console.ts 의 readStatus 와 같다 — 모양이 아니면 null. */
export function readStatus(text: string): StatusLine | null {
  const m = STATUS_HEAD.exec(text);
  if (m === null) return null;
  return { beats: Number(m[1]), now: Number(m[2]), paused: m[3] === '멈춤', text };
}

/**
 * status 글의 접속 칸 — `· 접속 ` 뒤 ` · 명부 ` 앞. 아무도 없으면 `-`. 항목은 `계정(body, body)` 이 공백으로 이어진다(괄호 안에도 공백이 있다).
 * 엔진 host/console.ts 의 statusText.
 */
export function linkedAccounts(text: string): string[] {
  const from = text.indexOf(' · 접속 ');
  const to = text.indexOf(' · 명부 ');
  if (from < 0 || to < from) return [];
  const field = text.slice(from + ' · 접속 '.length, to).trim();
  if (field === '-' || field === '') return [];
  return [...field.matchAll(/(?:^|\s)([^\s(]+)\(/g)].map((m) => m[1]!);
}

/**
 * 명령 하나의 답 글의 머리 — 엔진 host/console.ts 의 command 가 돌려주는 글. 그 명령의 답인가를 가린다.
 * 쓰는 법을 돌려줄 때(인자가 틀렸을 때)도 그 명령의 이름으로 시작한다. 모르는 명령은 `모르는 명령 `.
 */
export const ANSWER_HEAD: Record<Exclude<ConsoleCommand, 'stop'>, RegExp> = {
  pause: /^paused/,
  resume: /^resumed/,
  save: /^save/,
  step: /^step/,
  grant: /^grant/,
  revoke: /^revoke/,
  status: STATUS_HEAD,
};
export const UNKNOWN_HEAD = '모르는 명령 ';
