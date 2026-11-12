// Observe 소켓 — 수집기 · 운영자의 브라우저(밖) → 프로세스마다의 Monitor (design/01-flows/14-observe.md). 타입과 데이터뿐.
//   GET /health        200 · 503(내려가는 가운데)
//   GET /metrics       Metrics 의 JSON
//   GET /observe       text/event-stream — event: metrics(첫 글은 recent 를 함께) · event: trace
//   GET /observe/page  관측 페이지 한 장 — 흐름의 지도(FlowMap)를 품는다
// 흔적에 계정 · 캐릭터의 이름과 토큰이 없다. 수 · state · 단위의 이름뿐이다.

/** 흔적의 끝 — ◇ 는 wait, ✕ 는 refused, 「실패하면」은 failed. */
export const TRACE_ENDS = ['ok', 'wait', 'refused', 'failed'] as const;
export type TraceEnd = (typeof TRACE_ENDS)[number];

/** 흔적 하나 — 흐름의 단계 하나가 끝났다. `(flow, step)` 이 이름이다(흐름 표의 #). */
export interface Trace {
  readonly at: number;
  readonly flow: number;
  readonly step: number;
  /** 한 번의 실행을 묶는 이름. ⇒ 로 이어진 흐름은 같은 run 을 잇는다. */
  readonly run: string;
  /** 단계가 다룬 단위 — 인스턴스 · 존 · 노드 · 게이트웨이의 이름. 없으면 '-'. */
  readonly unit: string;
  readonly end: TraceEnd;
  /** 단위의 state 가 바뀌었으면 바뀐 뒤의 값. */
  readonly state?: string;
  /** 단계의 결과가 수이면 그 수 — 사람 · 지연 · 종료 코드. */
  readonly counts?: Readonly<Record<string, number>>;
}

/** 단계가 흔적을 남기는 함수 — 앱(Monitor.trace)이 개념에 준다. at 은 Monitor 가 찍는다. 기다리지 않고 실패하지 않는다. */
export type TraceFn = (trace: Omit<Trace, 'at'>) => void;

/** 단위 하나의 지금 — 흔적이 고친다. */
export interface UnitNow {
  readonly unit: string;
  readonly state: string | null;
  readonly counts: Readonly<Record<string, number>>;
  readonly at: number;
}

/** Monitor.metrics 의 답. tally 의 열쇠는 `<flow>.<step>.<end>`. */
export interface Metrics {
  readonly role: string;
  readonly build: string;
  readonly closing: boolean;
  readonly at: number;
  readonly units: readonly UnitNow[];
  readonly tally: Readonly<Record<string, number>>;
  /** 느려서 버린 흔적의 수 — 그 읽는 이의 몫. */
  readonly dropped?: number;
}

/** stream 의 첫 글 — 수치 하나와 최근의 흔적. */
export interface StreamHead {
  readonly metrics: Metrics;
  readonly recent: readonly Trace[];
}

/**
 * 관측의 지도 — design 에서 뽑는다. 손으로 쓰지 않는다.
 * 구조(프로세스 · 연결 · 개념이 사는 곳)는 design/README.md 의 표에서, 흐름 · 단계는 design/01-flows 에서.
 */
export interface FlowMap {
  readonly nodes: readonly MapNode[];
  readonly links: readonly MapLink[];
  readonly concepts: readonly MapConcept[];
  readonly flows: readonly MapFlow[];
}

/** 그림의 마디 — 프로세스 넷(api · gateway · control · node)과 밖(client · engine · storage · operator · observer). */
export interface MapNode {
  readonly id: string;
  readonly name: string;
  readonly external: boolean;
  /** 프로세스 표의 듣는 것 · 상태 · 늘리는 법. 밖은 '' */
  readonly listens: string;
  readonly holds: string;
  readonly scale: string;
}

/** 연결 하나 — README 「연결 여덟」의 줄. pairs 는 방향 글을 마디의 짝으로 푼 것. */
export interface MapLink {
  readonly name: string;
  readonly direction: string;
  readonly carries: string;
  /** 닿는 개념 — 이 연결로 밖에 닿는 단계의 개념 */
  readonly touches: readonly string[];
  readonly pairs: readonly (readonly [string, string])[];
}

/** 개념 하나가 사는 곳 — README 「모듈 다섯과 그 개념」 · 「앱」. */
export interface MapConcept {
  readonly name: string;
  readonly module: string;
  readonly duty: string;
  readonly processes: readonly string[];
  /** src 에 그 개념의 파일이 있는가 */
  readonly built: boolean;
}

export interface MapFlow {
  readonly flow: number;
  readonly file: string;
  readonly name: string;
  /** 머리의 「— 」 뒤 */
  readonly title: string;
  readonly trigger: string;
  readonly line: string;
  /** 「순서」의 text 블록 그대로 */
  readonly order: string;
  readonly steps: readonly MapStep[];
}

export interface MapStep {
  readonly step: number;
  /** `### A …` 절의 머리. 없으면 '' */
  readonly section: string;
  /** 어느 role 칸이 있는 흐름(1 · 7)의 그 칸. 없으면 '' */
  readonly role: string;
  /** 누가 칸 그대로 — 대개 `개념.기능` */
  readonly who: string;
  /** 누가 칸의 개념. 없으면 null */
  readonly concept: string | null;
  readonly what: string;
  readonly result: string;
  /** 코드가 이 단계의 흔적 `(흐름, #)` 을 남기는가 — 남기면 그 단계는 지금 돈다 */
  readonly traced: boolean;
}
