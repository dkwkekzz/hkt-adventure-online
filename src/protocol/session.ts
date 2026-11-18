// SessionRpc — API 서버 · 게이트웨이 ↔ 컨트롤 플레인 (design/README.md 의 연결 여덟, design/02-roles/gateway.md · session.md 의 소켓).
// 개발의 main 에서는 함수 부름이다 — 앱이 이어 준다. 받는 쪽은 세션 모듈의 openSession 이 낸 SessionSocket 하나, 보내는 쪽(kick)의 받는 쪽은 게이트웨이.
// 글마다 그 흐름의 run 이 실린다 — 받은 쪽의 단계는 같은 run 으로 흔적을 남긴다(흐름 14).

import type { TraceFn } from './observe';
import type { CharacterStoreSocket, DatabaseSocket } from './storage';

/** 거절 — 까닭. busy 면 잠시 뒤 다시 물으면 될 수 있다(컨트롤 플레인 · 스토리지 · 띄우기) — Api 는 503 으로 답한다. */
export interface Unattached {
  readonly why: string;
  readonly busy?: boolean;
}

/** enter 의 답 — 세션을 잡았다. gate 는 게이트웨이의 밖의 주소. page 는 Api 가 제 빌드의 것으로 짓는다(흐름 3 의 9). */
export interface Entered {
  readonly gate: string;
}

/** enter 의 답 — 줄에 섰다. 순번은 1 부터(흐름 3 의 20 · 21). */
export interface Waiting {
  readonly wait: number;
}

/** API 서버 → 컨트롤 플레인: 그 캐릭터의 입장 — 흐름 3 의 3 ~ 8 · 20. build 는 그 API 서버의 빌드. */
export type Enter = (character: string, build: string, run: string) => Promise<Entered | Waiting | Unattached>;

/** API 서버 → 컨트롤 플레인: 그 계정의 그 캐릭터를 지운다 — 흐름 8 의 8 ~ 11 을 한 번에. */
export type Forget = (account: string, character: string, run: string) => Promise<{ readonly forgot: string } | Unattached>;

/** attach 의 답 — 그 캐릭터가 이어질 호스트와, 호스트에 줄 새 토큰(흐름 9 의 9). 호스트의 주소는 클라이언트에게 가지 않는다. */
export interface Attached {
  readonly instance: string;
  /** 호스트의 소켓 주소 — 내부망의 것(`ws://<노드>:<포트>`) */
  readonly address: string;
  readonly token: string;
}

/** 게이트웨이 → 컨트롤 플레인: 그 캐릭터의 세션 — 흐름 9 의 3 ~ 9. run 은 그 접속의 것. 세션이 없으면 까닭 — 게이트웨이가 4002 로 닫는다. */
export type Attach = (character: string, gate: string, run: string) => Promise<Attached | Unattached>;
/** 게이트웨이 → 컨트롤 플레인: 그 캐릭터의 접속이 닫혔다 — 흐름 11 의 1 → 2. */
export type Detach = (character: string, gate: string, run: string) => void;

/** GateReporter.report 의 글 — 흐름 1 의 5 · 5 의 6 · 7 의 7. */
export interface GateReport {
  readonly name: string;
  readonly address: string;
  readonly closing: boolean;
  readonly connections: readonly { readonly character: string; readonly instance: string | null }[];
}
/** 게이트웨이 → 컨트롤 플레인: 든 접속 — 받는 쪽은 Gates.seen(흐름 5 의 8). */
export type Report = (report: GateReport, run: string) => void;

/** 컨트롤 플레인 → 게이트웨이: 그 캐릭터의 접속을 그 코드로 닫게 한다 — Router.kick. */
export type Kick = (character: string, code: number, run: string) => void;

/** 컨트롤 플레인 → 게이트웨이: 그 캐릭터의 접속의 뒤를 새 호스트로 바꿔 잇게 한다 — Router.reroute(흐름 10 의 11 → 12). */
export type Reroute = (character: string, to: Attached, run: string) => void;

/** 컨트롤 플레인의 받는 쪽 — openSession 이 낸다. close 는 간격을 멈춘다(흐름 7). */
export interface SessionSocket {
  readonly enter: Enter;
  readonly forget: Forget;
  readonly attach: Attach;
  readonly detach: Detach;
  readonly report: Report;
  /** 노드 → 컨트롤 플레인(NodeRpc handoff): 그 인스턴스의 호스트가 떠남 줄을 찍었다 — 흐름 10. to 는 `<존>` 또는 `<존>@<공간>` */
  handoff(instance: string, character: string, to: string, run: string): void;
  /** 비움 — 그 인스턴스의 사람을 같은 존의 다른 인스턴스로 옮긴다(흐름 6 의 drain ⇒ 흐름 10). 옮긴 수 */
  drain(instance: string, run: string): Promise<number>;
  /** Recoverer 가 부른다 — 죽은 인스턴스에 있던 세션을 다시 배정한다(흐름 12 의 4 · 5). */
  recover(instance: string, run: string): Promise<void>;
  /** Scaler 가 부른다 — 그 인스턴스에 잡힌 슬롯(Sessions.count) */
  count(instance: string): number;
  close(): void;
}

/** 설정의 `session` — 상한 · 만료 · 한계 (design/02-roles/session.md). */
export interface SessionConfig {
  /** pending 의 만료 — 입장 뒤 이 안에 접속하지 않으면 흐름 5 의 13 이 지운다 */
  readonly pendingMs: number;
  /** 재접속 유예 — 끊긴 뒤 이 안에 돌아오지 않으면 흐름 11 의 3 ~ 6 */
  readonly graceMs: number;
  /** 게이트웨이의 보고가 이만큼 없으면 끊긴 것이다(흐름 5 의 11) */
  readonly gateLimitMs: number;
  /** 줄에 선 사람이 이만큼 묻지 않으면 줄에서 뺀다(흐름 5 의 14) */
  readonly queueForgetMs: number;
}

/** 존 하나 — 설정의 줄(Zone). 처음 서는 존은 설정의 첫 줄. */
export interface ZoneSpec {
  readonly name: string;
  readonly dataset: string;
  /** 인스턴스 하나의 상한 — 잡힌 슬롯(세션)의 수. 성능으로 잰 값(엔진의 bench) */
  readonly capacity: number;
  /** 예비 용량 — 그 존에 미리 비워 두는 슬롯의 수(Scaler). 0 이면 입장이 띄운다 */
  readonly spare: number;
}

/** openSession 이 받는 것 — 다른 모듈의 기능은 앱이 준 함수다(design/02-roles/session.md 의 머리). */
export interface SessionOptions {
  readonly config: SessionConfig;
  readonly zones: readonly ZoneSpec[];
  /** 처음 서는 존 */
  readonly entry: string;
  /** 간격 — 흐름 5 의 C 가운데 세션의 단계(Gates.dead · Sessions.expired · Queue.next) */
  readonly clockMs: number;
  /** 표 `lastZone` · `zones` 와 캐릭터의 값(흐름 8 의 10) */
  readonly database: DatabaseSocket;
  readonly characters: CharacterStoreSocket;
  /** Characters.owner — 그 캐릭터의 줄(계정 · 이름). 없으면 null */
  readonly owner: (character: string) => Promise<{ readonly account: string; readonly name: string } | null>;
  /** Banlist.banned */
  readonly banned: (account: string) => Promise<boolean>;
  /** Characters.remove — 흐름 8 의 9 */
  readonly remove: (character: string) => Promise<void>;
  /** 플릿 — 그 존의 ready 인 인스턴스들과 그 빌드 */
  readonly ready: (zone: string) => readonly { readonly name: string; readonly build: string }[];
  /** 플릿 — 흐름 3 의 B. 그 존에 인스턴스를 띄웠으면(또는 뜨고 있던 것이 섰으면) true, 띄울 곳이 없으면 false. 띄우다 실패하면 던진다 */
  readonly launch: (zone: string, build: string, run: string) => Promise<boolean>;
  /** 플릿 — 그 인스턴스의 호스트 주소(내부망). ready 가 아니면 null */
  readonly address: (instance: string) => string | null;
  /** 플릿 — Loader.load(NodeRpc load): 그 인스턴스에 캐릭터의 값을 올린다. spot 은 설 공간(없으면 값의 자리). 되면 null, 아니면 까닭 */
  readonly load: (instance: string, character: string, spot: string | null, run: string) => Promise<string | null>;
  /** 플릿 — Loader.unload(NodeRpc unload): 그 인스턴스에서 값을 내려 저장하고 lease 를 푼다. 되면 null, 아니면 까닭 */
  readonly unload: (instance: string, character: string, run: string) => Promise<string | null>;
  /** Signer.issue — 호스트에 줄 캐릭터의 토큰(흐름 9 의 9) */
  readonly issue: (character: string) => string;
  /** SessionRpc kick — 그 게이트웨이에 */
  readonly kick: (gate: string, character: string, code: number, run: string) => void;
  /** SessionRpc reroute — 그 게이트웨이에 */
  readonly reroute: (gate: string, character: string, to: Attached, run: string) => void;
  readonly trace: TraceFn;
  readonly log: (line: string) => void;
  /** 지금(ms) — 테스트가 돌린다 */
  readonly now?: () => number;
}
