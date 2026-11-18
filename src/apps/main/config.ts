// 서비스의 설정 — service.config.json(저장소 뿌리)을 읽는다. 게임의 값(데이터셋 · NPC 묶음)은 여기에만 든다(경계 규칙 N).
// 서명 키는 설정 파일에 두지 않는다 — 환경변수 HOST_AUTH_KEY(엔진과 같은 이름). 스토리지의 자리 · 자격도 환경변수(MONGODB_URI · SNAPSHOT_URI · S3_ENDPOINT · AWS_*).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type { FleetConfig, FleetZone } from '../../fleet';
import type { GatewayConfig } from '../../protocol/gateway';
import type { SessionConfig } from '../../protocol/session';
import type { BucketOptions, StorageOptions } from '../../protocol/storage';

/** service.config.json 의 fleet — 컨트롤 플레인(플릿 모듈의 FleetConfig)과 노드(노드 모듈의 NodeConfig 로 앱이 옮긴다)가 같이 읽는다. */
export type FleetSection = FleetConfig & {
  readonly engineDir: string;
  /** 사람의 묶음의 틀 — 엔진의 --party(body 이름) */
  readonly party: string;
  /** 뷰어의 묶음이 놓일 자리(viewer.js) — API 서버가 시작 때 한 번 묶는다(흐름 1 의 2). Static 이 준다 */
  readonly viewerOut: string;
  readonly beat: number;
  readonly sparse: number;
  /** 엔진의 포트 범위 — env NODE_PORTS */
  readonly ports: readonly [number, number];
  /** 게이트웨이에서 이 노드의 호스트가 보이는 이름 — 내부망(Node.host) */
  readonly hostName: string;
  /** 이 서버의 노드 — 이름과 slots(띄울 수 있는 인스턴스의 수) */
  readonly node: { readonly name: string; readonly slots: number };
  /** 이 노드의 디렉터리 — 인스턴스마다 건넴 자리(캐릭터 파일) · 프로세스 기록 · 백업의 사본 */
  readonly spool: string;
  readonly startLimitMs: number;
  readonly commandLimitMs: number;
  /** 이만큼 Clock 마다 도는 인스턴스를 백업한다(흐름 5 의 3). 0 이면 하지 않는다 */
  readonly backupEvery: number;
  /** 인스턴스마다 남기는 백업의 수 */
  readonly backupKeep: number;
  /** 노드가 내려갈 때 사람이 옮겨지기를 기다리는 한계(흐름 7 의 3) */
  readonly closingMs: number;
};

export interface ServiceConfig {
  readonly fleet: FleetSection;
  /** 존의 줄 — 이름 · 데이터셋 · 상한(capacity) · 예비 용량(spare) · NPC 묶음(npc — 없으면 fleet.npc.bodies). 처음 서는 존은 첫 줄 */
  readonly zones: readonly FleetZone[];
  /** 뷰어의 Keymap — 엔진 web 상대의 파일 또는 조작 틀의 폴더(틀 하나 = `<틀>.json` 하나). Static 이 /keymap.json 으로 준다. 없으면 null — 뷰어는 메뉴로만 고른다. */
  readonly keymap: string | null;
  /** 기본 조작 틀 — keymap 이 폴더일 때 페이지에 `?scheme=` 이 없으면 이 틀. null 이면 이름 순의 첫 틀. */
  readonly scheme: string | null;
  /** 스토리지 — 개발의 뿌리(storageRoot) · lease 의 길이 · 캐릭터의 이력과 환경변수의 뒤. */
  readonly storage: StorageOptions;
  /** 게이트웨이 — 포트와 한계 · 주기(design/02-roles/gateway.md). env GATE_PORT 가 포트를 덮는다 */
  readonly gateway: GatewayConfig;
  /** 세션 — 인스턴스의 상한(capacity) · 만료 · 한계(design/02-roles/session.md). 존은 지금 하나 — fleet 의 world · dataset */
  readonly session: SessionConfig;
  readonly apiPort: number;
  /** 뷰어 페이지의 주소(`…/play`) — Api 가 입장의 답(page)을 짓는다 */
  readonly pageUrl: string;
  /** 게이트웨이의 밖의 주소 — GateReporter 가 알리고 Gates.pick 이 준다 */
  readonly gateUrl: string;
  /** 계정의 토큰 수명(초) — Api 에만 쓴다. */
  readonly tokenTtl: number;
  /** 캐릭터의 토큰 수명(초) — 고르기(흐름 8 의 7)가 낸다. 입장 · 게이트웨이 · 뷰어 페이지의 ?token= 이 든다 */
  readonly characterTtl: number;
  /** 한 계정의 캐릭터 수 */
  readonly characterLimit: number;
  /** NPC 에이전트의 토큰 수명(초) — 접속 한 번에만 쓴다. */
  readonly agentTtl: number;
  /** Monitor 의 내부 주소의 포트(흐름 14). 0 이면 빈 포트. */
  readonly monitorPort: number;
  /** Monitor 가 드는 최근 흔적의 상한. */
  readonly traceKeep: number;
  /** 이 서버의 빌드 — engine.lock 의 커밋(앞 12 자). 없으면 '-'. */
  readonly build: string;
  /** 이 프로세스의 role — `main`(넷을 한 프로세스에) · `api` · `gateway` · `control` · `node`. env SERVICE_ROLE 가 덮는다 */
  readonly role: Role;
  /** 내부망의 글(SessionRpc · NodeRpc · Operator) — 이 서버가 내부망에서 보이는 이름 · role 마다 듣는 포트 · 글 하나의 한계 */
  readonly rpc: { readonly host: string; readonly controlPort: number; readonly nodePort: number; readonly gatewayPort: number; readonly limitMs: number };
  /** 활성 컨트롤 플레인의 자리 — 만료(ttlMs) · 표가 서기를 기다리는 한계(settleMs) — 흐름 13 */
  readonly leader: { readonly ttlMs: number; readonly settleMs: number };
  /** 운영자의 이름들 — OPERATOR_KEY 로 서명한 `o<이름>` 토큰 가운데 이 이름만 받는다(흐름 6 의 2). stdin 의 콘솔은 첫 이름 */
  readonly operators: readonly string[];
  /** 계정의 청소 — 캐릭터가 없고 이만큼 오지 않은 계정을 지운다(흐름 5 의 15) */
  readonly accountIdleMs: number;
}

export const ROLES = ['main', 'api', 'gateway', 'control', 'node'] as const;
export type Role = (typeof ROLES)[number];

type Raw = Omit<ServiceConfig, 'fleet' | 'build' | 'storage' | 'pageUrl' | 'gateUrl' | 'role'> & {
  role?: Role;
  storageRoot: string;
  leaseMs: number;
  characterHistory: number;
  fleet: Omit<FleetSection, 'ports' | 'hostName' | 'spool' | 'node'> & { ports: [number, number]; publicHost: string; secure: boolean; hostName?: string; node?: { name?: string; slots?: number } };
};

/** SNAPSHOT_URI(`s3://<bucket>/<prefix>`)와 S3_ENDPOINT · AWS_* → object storage 의 자리. 없으면 null — Store 는 storageRoot 의 디렉터리로. */
export function bucketOf(env: NodeJS.ProcessEnv): BucketOptions | null {
  const uri = env['SNAPSHOT_URI'];
  if (uri === undefined || uri === '') return null;
  const m = /^s3:\/\/([^/]+)\/?(.*)$/.exec(uri.trim());
  if (m === null) throw new Error(`SNAPSHOT_URI 는 s3://<bucket>/<prefix> — ${uri}`);
  const accessKey = env['AWS_ACCESS_KEY_ID'] ?? '';
  const secretKey = env['AWS_SECRET_ACCESS_KEY'] ?? '';
  if (accessKey === '' || secretKey === '') throw new Error('SNAPSHOT_URI 에는 AWS_ACCESS_KEY_ID · AWS_SECRET_ACCESS_KEY 가 있어야 한다');
  const region = env['AWS_REGION'] || env['AWS_DEFAULT_REGION'] || 'us-east-1';
  return {
    bucket: m[1]!,
    prefix: m[2]!.replace(/\/+$/, ''),
    endpoint: (env['S3_ENDPOINT'] || `https://s3.${region}.amazonaws.com`).replace(/\/+$/, ''),
    region,
    accessKey,
    secretKey,
    sessionToken: env['AWS_SESSION_TOKEN'] || null,
  };
}

/**
 * 파일 하나를 읽는다. 상대 경로(engineDir · storageRoot · viewerOut)는 그 파일의 자리에서. env 의 SERVICE_* · PORT · MONITOR_PORT 가 몇 칸을 덮는다.
 * 스토리지의 뒤는 env 의 MONGODB_URI(표 · 캐릭터 · lease · 잠금)와 SNAPSHOT_URI(Store) — 없는 쪽은 storageRoot 의 디렉터리.
 * build 는 그 파일 곁의 engine.lock 의 커밋.
 * pageUrl 은 SERVICE_PAGE_URL, 없으면 `http(s)://<publicHost>:<apiPort>/play` — 앞에 프록시가 서면 SERVICE_PAGE_URL 로 준다.
 * gateUrl(게이트웨이의 밖의 주소)은 SERVICE_GATE_URL, 없으면 `ws(s)://<publicHost>:<gateway.port>`.
 * role 은 SERVICE_ROLE. 내부망: SERVICE_INTERNAL_HOST · CONTROL_PORT · NODE_PORT · GATE_RPC_PORT. 노드: NODE_NAME · NODE_SLOTS · NODE_HOST(게이트웨이가 호스트를 보는 이름).
 * 노드마다 이름이 다르다(NODE_NAME). spool 은 `<storageRoot>/spool/<노드>` — 한 서버에 노드 둘이어도 서로의 pid · 캐릭터 파일을 건드리지 않는다. 포트 범위는 NODE_PORTS=`<from>-<to>` 로 가른다.
 */
/** `<from>-<to>` — NODE_PORTS. */
function portsOf(v: string): [number, number] {
  const m = /^(\d+)-(\d+)$/.exec(v.trim());
  if (m === null || Number(m[1]) > Number(m[2])) throw new Error(`NODE_PORTS 는 <from>-<to> — ${v}`);
  return [Number(m[1]), Number(m[2])];
}

export function loadConfig(file: string, env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Raw;
  const base = dirname(resolve(file));
  const at = (p: string): string => (isAbsolute(p) ? p : resolve(base, p));
  const num = (v: string | undefined, d: number): number => (v === undefined || v === '' ? d : Number(v));
  const apiPort = num(env['PORT'], raw.apiPort);
  const lock = at('engine.lock');
  const build = existsSync(lock) ? (readFileSync(lock, 'utf8').split('\n')[1] ?? '').trim().slice(0, 12) || '-' : '-';
  const publicHost = env['SERVICE_PUBLIC_HOST'] ?? raw.fleet.publicHost;
  const secure = env['SERVICE_SECURE'] === undefined ? raw.fleet.secure : env['SERVICE_SECURE'] === '1';
  const { storageRoot, leaseMs, characterHistory, ...rest } = raw;
  const gateway: GatewayConfig = { ...raw.gateway, port: num(env['GATE_PORT'], raw.gateway.port) };
  const { publicHost: _p, secure: _s, hostName, node, ...fleet } = raw.fleet;
  if (!Array.isArray(raw.zones) || raw.zones.length === 0) throw new Error(`설정에 존이 없다 — zones (${file})`);
  const role = (env['SERVICE_ROLE'] ?? raw.role ?? 'main') as Role;
  if (!ROLES.includes(role)) throw new Error(`모르는 role — ${role} (${ROLES.join(' · ')})`);
  const rpcHost = env['SERVICE_INTERNAL_HOST'] ?? raw.rpc.host;
  const root = at(env['SERVICE_STORAGE'] ?? storageRoot);
  return {
    ...rest,
    storage: {
      root,
      mongodbUri: env['MONGODB_URI'] || null,
      bucket: bucketOf(env),
      leaseMs,
      characterHistory,
    },
    role,
    rpc: {
      ...raw.rpc,
      host: rpcHost,
      controlPort: num(env['CONTROL_PORT'], raw.rpc.controlPort),
      nodePort: num(env['NODE_PORT'], raw.rpc.nodePort),
      gatewayPort: num(env['GATE_RPC_PORT'], raw.rpc.gatewayPort),
    },
    apiPort,
    monitorPort: num(env['MONITOR_PORT'], raw.monitorPort),
    build,
    gateway,
    pageUrl: env['SERVICE_PAGE_URL'] ?? `${secure ? 'https' : 'http'}://${publicHost}:${apiPort}/play`,
    gateUrl: env['SERVICE_GATE_URL'] ?? `${secure ? 'wss' : 'ws'}://${publicHost}:${gateway.port}`,
    fleet: {
      ...fleet,
      engineDir: at(env['SERVICE_ENGINE'] ?? raw.fleet.engineDir),
      viewerOut: at(raw.fleet.viewerOut),
      hostName: env['NODE_HOST'] ?? hostName ?? 'localhost',
      node: { name: env['NODE_NAME'] ?? node?.name ?? 'node-1', slots: num(env['NODE_SLOTS'], node?.slots ?? 4) },
      ports: env['NODE_PORTS'] === undefined ? raw.fleet.ports : portsOf(env['NODE_PORTS']),
      spool: join(root, 'spool', env['NODE_NAME'] ?? node?.name ?? 'node-1'),
    },
  };
}
