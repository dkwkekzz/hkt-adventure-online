// 경계 규칙 — 어느 층이 어느 층을 import 할 수 있는가(S · A · T · F · D · G · C · P), 앱이 모듈에 닿는 자리(P), 게임 명사(N), 엔진에 닿는 길(E).
// 이 파일은 판단만 한다 — 파일을 읽지 않는다. 읽고 걷는 것은 check.ts. 규칙의 뜻은 CLAUDE.md §경계.

export type Layer =
  | { readonly kind: 'protocol' }
  | { readonly kind: 'module'; readonly name: 'account' | 'storage' | 'fleet' | 'node' | 'gateway' | 'session'; readonly index: boolean; readonly test: boolean }
  | { readonly kind: 'app'; readonly test: boolean }
  | { readonly kind: 'tool' };

export const MODULES = ['account', 'storage', 'fleet', 'node', 'gateway', 'session'] as const;

/** src 상대 경로 → 층. 어느 층도 아니면 null. */
export function layerOf(rel: string): Layer | null {
  const parts = rel.split(/[\\/]/);
  const top = parts[0];
  if (top === 'protocol') return { kind: 'protocol' };
  if (top === 'account' || top === 'storage' || top === 'fleet' || top === 'node' || top === 'gateway' || top === 'session') return { kind: 'module', name: top, index: parts.length === 2 && parts[1] === 'index.ts', test: parts[1] === 'tests' };
  if (top === 'apps') return { kind: 'app', test: parts.includes('tests') };
  if (top === 'tools') return { kind: 'tool' };
  return null;
}

/** import 하나의 판정 — from 층의 파일이 to 층의 파일을 import. 괜찮으면 null. */
export function judgeImport(from: Layer, to: Layer): string | null {
  // S. protocol 은 아무것도 import 하지 않는다 — 타입과 데이터뿐
  if (from.kind === 'protocol') return to.kind === 'protocol' ? null : `규칙 S — protocol 은 아무것도 import 하지 않는다 (${to.kind})`;
  if (to.kind === 'protocol') return null; // 소켓 선언은 누구나 본다
  if (to.kind === 'tool' && from.kind !== 'tool') return `도구는 아무도 import 하지 않는다`;

  if (from.kind === 'module') {
    if (to.kind === 'module' && to.name === from.name) return null;
    // 모듈의 tests/ 는 세움에 다른 모듈의 index.ts(밖에 내보낸 것)를 쓸 수 있다 — 안은 보지 않는다
    if (from.test && to.kind === 'module' && (to.index || to.test)) return null;
    const rule = { account: 'A', storage: 'T', fleet: 'F', node: 'D', gateway: 'G', session: 'C' }[from.name];
    return `규칙 ${rule} — ${from.name} 는 protocol 만 import 한다 (${to.kind === 'module' ? to.name : to.kind})`;
  }

  if (from.kind === 'app') {
    if (to.kind === 'app') return null;
    if (from.test) return null; // 조립 테스트
    if (to.kind === 'module') return to.index ? null : `규칙 P — 앱은 모듈의 index.ts 만 import 한다 (${to.name} 의 안)`;
    return null;
  }
  return null; // tool
}

/**
 * P. 앱(테스트 밖)이 모듈의 객체에 부르는 것 — 흐름에서 트리거가 (밖)이거나 누가 가 Service · Api 인 단계, 그리고 Api 가 부르는 단계(로그인 · 캐릭터 — 흐름 2 · 8).
 * 그리고 프로세스 사이의 소켓을 잇는 자리 — 개발의 main 에서는 함수 부름, 갈리면 내부망의 글의 받는 쪽이다: SessionRpc(session.enter · forget · attach · detach · report, gateway.reroute · kick),
 * NodeRpc(fleet.register · report · handoff · exited · load · unload · command, node.launch · stop · command · load · unload), 활성 컨트롤 플레인을 찾는 storage.leader.holder.
 * 그리고 Elector 가 부르는 컨트롤 플레인의 자리(fleet.reload · settled · settle · standby, session.settle — 흐름 13), 컨트롤 플레인의 Clock(fleet.start · session.tick), 노드의 시작 · 내림(node.start · close).
 * 그리고 같은 프로세스 안의 개념에 다른 모듈의 기능을 함수로 넘기는 자리 — 책임 문서가 「앱이 준다」고 적은 것(characters.owner · remove, banlist.banned · ban · unban, directory.sweep, fleet.ready · launch · address,
 * session.count · recover · drain · handoff · reconcile, 운영자의 것 session.kick · evict · closeZone · openZone · playing).
 * gateway.listen · close 는 흐름 1 의 4 · 5 와 흐름 7 의 7 · 8, session.close 는 세션의 간격 — Service.start · stop 이 그 role 의 개념을 세우고 내린다.
 */
export const APP_CALLS: Readonly<Record<string, readonly string[]>> = {
  directory: ['resolve', 'sweep'],
  characters: ['list', 'create', 'owner', 'remove'],
  banlist: ['banned', 'ban', 'unban'],
  signer: ['issue', 'verify'],
  fleet: ['start', 'close', 'operator.command', 'ready', 'launch', 'address', 'load', 'unload', 'command', 'register', 'report', 'handoff', 'exited', 'reload', 'settled', 'settle', 'standby'],
  node: ['start', 'close', 'launch', 'stop', 'command', 'load', 'unload'],
  session: ['enter', 'forget', 'attach', 'detach', 'report', 'handoff', 'drain', 'recover', 'count', 'reconcile', 'settle', 'tick', 'kick', 'evict', 'closeZone', 'openZone', 'playing', 'close'],
  storage: ['close', 'leader.holder'],
  gateway: ['listen', 'close', 'reroute', 'kick'],
};

export function judgeAppCall(object: string, chain: string): string | null {
  const allowed = APP_CALLS[object];
  if (allowed === undefined || allowed.includes(chain)) return null;
  return `규칙 P — 앱이 ${object}.${chain} 를 부른다. 앱이 닿는 자리는 ${Object.entries(APP_CALLS).flatMap(([o, cs]) => cs.map((c) => `${o}.${c}`)).join(' · ')}`;
}

/** N. 게임 명사 — 모듈 · 앱의 코드(테스트 밖)와 책임 · 흐름 문서에 없다. 값은 service.config.json 에. */
export const GAME_NOUNS = ['요정', '늑대', '약초', '사과', '악마', '부에르', '어머니', '무리', '포션', 'fairy', 'wolf', 'blight', 'demon', 'buer', 'mother', 'horde', 'corner', 'glade', 'potion'] as const;

export function nounsIn(text: string): string[] {
  const lower = text.toLowerCase();
  return GAME_NOUNS.filter((n) => lower.includes(n));
}

/**
 * E. 엔진에 닿는 길은 Spawner 하나 — child_process 와 엔진의 진입점 · 인자 짓기는 node/spawner.ts 에만.
 * 엔진 체크아웃의 파일을 읽는 것은 Spawner 와 Static(뷰어의 페이지 · 실물을 준다 — apps/main/static.ts) 둘뿐.
 */
export const ENGINE_ONLY = 'node/spawner.ts';
export const ENGINE_FILES = 'apps/main/static.ts';
export const ENGINE_NAMES = ['ENGINE_WEB', 'ENGINE_TSX', 'ENGINE_HOST', 'ENGINE_AGENT', 'ENGINE_ESBUILD', 'VIEWER_ENTRY', 'hostArgv', 'agentArgv', 'bundleArgv'] as const;
export const ENGINE_FILE_NAMES = ['ENGINE_WEB', 'VIEWER_PAGE', 'VIEWER_ASSETS', 'VIEWER_EXT'] as const;

export function judgeEngine(rel: string, specifier: string, names: readonly string[]): string | null {
  if (rel === ENGINE_ONLY || rel.startsWith('protocol/') || rel.split(/[\\/]/).includes('tests')) return null;
  if (specifier === 'node:child_process' || specifier === 'child_process') return `규칙 E — child_process 는 ${ENGINE_ONLY} 에만`;
  const run = names.filter((n) => (ENGINE_NAMES as readonly string[]).includes(n) && !(rel === ENGINE_FILES && n === 'ENGINE_WEB'));
  if (run.length > 0) return `규칙 E — 엔진의 진입점 · 인자(${run.join(', ')})는 ${ENGINE_ONLY} 에만`;
  const files = names.filter((n) => (ENGINE_FILE_NAMES as readonly string[]).includes(n) && n !== 'ENGINE_WEB');
  if (files.length > 0 && rel !== ENGINE_FILES) return `규칙 E — 엔진의 파일 자리(${files.join(', ')})는 ${ENGINE_ONLY} · ${ENGINE_FILES} 에만`;
  return null;
}
