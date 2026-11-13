// 서비스의 설정 — service.config.json(저장소 뿌리)을 읽는다. 게임의 값(데이터셋 · NPC 묶음)은 여기에만 든다(경계 규칙 N).
// 서명 키는 설정 파일에 두지 않는다 — 환경변수 HOST_AUTH_KEY(엔진과 같은 이름). 스토리지의 자리 · 자격도 환경변수(MONGODB_URI · SNAPSHOT_URI · S3_ENDPOINT · AWS_*).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { FleetConfig } from '../../fleet';
import type { GatewayConfig } from '../../protocol/gateway';
import type { BucketOptions, StorageOptions } from '../../protocol/storage';

export interface ServiceConfig {
  readonly fleet: FleetConfig;
  /** 뷰어의 Keymap 파일 — 엔진 web 상대. Static 이 /keymap.json 으로 준다. 없으면 null. */
  readonly keymap: string | null;
  /** 스토리지 — 개발의 뿌리(storageRoot) · lease 의 길이 · 캐릭터의 이력과 환경변수의 뒤. */
  readonly storage: StorageOptions;
  /** 게이트웨이 — 포트와 한계 · 주기(design/02-roles/gateway.md). env GATE_PORT 가 포트를 덮는다 */
  readonly gateway: GatewayConfig;
  readonly apiPort: number;
  /** 사람의 토큰 수명(초). */
  readonly tokenTtl: number;
  /** NPC 에이전트의 토큰 수명(초) — 접속 한 번에만 쓴다. */
  readonly agentTtl: number;
  /** Monitor 의 내부 주소의 포트(흐름 14). 0 이면 빈 포트. */
  readonly monitorPort: number;
  /** Monitor 가 드는 최근 흔적의 상한. */
  readonly traceKeep: number;
  /** 이 서버의 빌드 — engine.lock 의 커밋(앞 12 자). 없으면 '-'. */
  readonly build: string;
}

type Raw = Omit<ServiceConfig, 'fleet' | 'build' | 'storage'> & {
  storageRoot: string;
  leaseMs: number;
  characterHistory: number;
  fleet: Omit<FleetConfig, 'ports' | 'pageUrl' | 'gateUrl' | 'hostName'> & { ports: [number, number]; publicHost: string; secure: boolean; hostName?: string };
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
 */
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
  const { publicHost: _p, secure: _s, hostName, ...fleet } = raw.fleet;
  return {
    ...rest,
    storage: {
      root: at(env['SERVICE_STORAGE'] ?? storageRoot),
      mongodbUri: env['MONGODB_URI'] || null,
      bucket: bucketOf(env),
      leaseMs,
      characterHistory,
    },
    apiPort,
    monitorPort: num(env['MONITOR_PORT'], raw.monitorPort),
    build,
    gateway,
    fleet: {
      ...fleet,
      engineDir: at(env['SERVICE_ENGINE'] ?? raw.fleet.engineDir),
      viewerOut: at(raw.fleet.viewerOut),
      pageUrl: env['SERVICE_PAGE_URL'] ?? `${secure ? 'https' : 'http'}://${publicHost}:${apiPort}/play`,
      gateUrl: env['SERVICE_GATE_URL'] ?? `${secure ? 'wss' : 'ws'}://${publicHost}:${gateway.port}`,
      hostName: hostName ?? 'localhost',
    },
  };
}
