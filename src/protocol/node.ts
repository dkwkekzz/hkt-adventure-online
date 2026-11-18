// NodeRpc — 컨트롤 플레인 ↔ 노드 (design/README.md 의 연결 여덟, design/02-roles/fleet.md 의 소켓 표).
// 개발의 main 에서는 함수 부름이다 — 앱이 잇는다. 프로세스가 갈리면 내부망의 글이다(앱의 rpc) — 글마다 그 흐름의 run 과, 컨트롤 플레인이 보내는 것에는 term 이 실린다.

/** 띄울 것 — 그 존의 데이터셋과 NPC 묶음(설정). */
export interface LaunchSpec {
  readonly dataset: string;
  readonly npc: readonly string[];
}

/** launch 의 답 — 그 포트. 아니면 까닭: refused 면 같은 인자로 다시 띄워도 같다(데이터셋 거부 · NPC 묶음 거부), stopped 면 뜨는 가운데 내리라고 했다. */
export type Launched = { readonly port: number } | { readonly why: string; readonly refused: boolean; readonly stopped: boolean };

/** 노드의 알림 — 흐름 1 의 10 · 13 의 4. */
export interface NodeHello {
  readonly name: string;
  /** NodeRpc 의 주소(내부망) — 컨트롤 플레인이 이리로 보낸다 */
  readonly address: string;
  /** 내부망에서 이 노드의 호스트가 보이는 이름 — 게이트웨이가 `ws://<host>:<port>` 로 잇는다 */
  readonly host: string;
  readonly build: string;
  /** 띄울 수 있는 인스턴스의 수 — 코어 */
  readonly slots: number;
}

/** 노드가 든 인스턴스 하나 — 흐름 5 의 4. */
export interface InstanceReport {
  readonly name: string;
  readonly epoch: number;
  readonly state: 'starting' | 'ready' | 'stopping';
  readonly port: number | null;
  /** 지난 status 의 접속한 캐릭터 수(NPC 밖) */
  readonly players: number;
  /** 틱 지연(ms) */
  readonly lag: number;
  /** 사람 없이 지난 Clock 의 수 */
  readonly idle: number;
  /** 로드된 캐릭터들 — Loader 가 든 것 */
  readonly loaded: readonly string[];
}

/** NodeReporter.report 의 글 — 흐름 5 의 4 · 7 의 1. */
export interface NodeReport {
  readonly name: string;
  /** 알림의 것 그대로 — 컨트롤 플레인이 바뀌었으면(흐름 13 의 4) 새 활성이 이것으로 노드를 적는다 */
  readonly hello: NodeHello;
  readonly closing: boolean;
  readonly instances: readonly InstanceReport[];
}

/** 노드의 받는 쪽 — 컨트롤 플레인 → 노드. 노드의 조립(NodeAgent)이 낸다. */
export interface NodeSocket {
  /** 흐름 3 의 B 가운데 노드의 일(13 ~ 18) */
  launch(instance: string, epoch: number, spec: LaunchSpec, run: string): Promise<Launched>;
  /** 흐름 7 의 3 ~ 5 — 값을 내리고 호스트를 내리고 Store 를 올린다. 끝은 exited(stopped) 로 알린다 */
  stop(instance: string, run: string): Promise<void>;
  /** Console 글 한 줄 → 답 한 줄(없으면 null) — 흐름 6 의 host */
  command(instance: string, line: string, run: string): Promise<string | null>;
  /** Loader.load · unload — 흐름 9 의 5 ~ 7 · 10 의 5 ~ 7. 되면 null, 아니면 까닭 */
  load(instance: string, character: string, spot: string | null, run: string): Promise<string | null>;
  unload(instance: string, character: string, run: string): Promise<string | null>;
}

/** 컨트롤 플레인의 받는 쪽 — 노드 → 컨트롤 플레인. 컨트롤 플레인의 Fleet 이 낸다. */
export interface ControlSocket {
  /** 흐름 1 의 10 → 11 · 13 의 4 */
  register(hello: NodeHello, run: string): void;
  /** 흐름 5 의 4 → 7 · 7 의 1 */
  report(report: NodeReport, run: string): void;
  /** 호스트의 떠남 줄 — 흐름 4 → 10 */
  handoff(instance: string, character: string, to: string, run: string): void;
  /** 호스트가 끝났다 — 흐름 4 의 5. stopped 면 내림(흐름 7 의 6), 아니면 흐름 12 */
  exited(instance: string, epoch: number, code: number, stopped: boolean, run: string): void;
}
