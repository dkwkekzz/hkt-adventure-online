// 서비스의 설정 — service.config.json(저장소 뿌리)을 읽는다. 게임의 값(데이터셋 · NPC 묶음)은 여기에만 든다(경계 규칙 N).
// 서명 키는 설정 파일에 두지 않는다 — 환경변수 HOST_AUTH_KEY(엔진과 같은 이름).

import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { FleetConfig } from '../../fleet';

export interface ServiceConfig {
  readonly fleet: FleetConfig;
  /** 뷰어의 Keymap 파일 — 엔진 web 상대. Static 이 /keymap.json 으로 준다. 없으면 null. */
  readonly keymap: string | null;
  readonly storageRoot: string;
  readonly apiPort: number;
  /** 사람의 토큰 수명(초). */
  readonly tokenTtl: number;
  /** NPC 에이전트의 토큰 수명(초) — 접속 한 번에만 쓴다. */
  readonly agentTtl: number;
}

type Raw = Omit<ServiceConfig, 'fleet'> & { fleet: Omit<FleetConfig, 'ports' | 'pageUrl'> & { ports: [number, number] } };

/**
 * 파일 하나를 읽는다. 상대 경로(engineDir · storageRoot · viewerOut)는 그 파일의 자리에서. env 의 SERVICE_* 가 몇 칸을 덮는다.
 * pageUrl 은 SERVICE_PAGE_URL, 없으면 `http(s)://<publicHost>:<apiPort>/play` — 앞에 프록시가 서면 SERVICE_PAGE_URL 로 준다.
 */
export function loadConfig(file: string, env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Raw;
  const base = dirname(resolve(file));
  const at = (p: string): string => (isAbsolute(p) ? p : resolve(base, p));
  const num = (v: string | undefined, d: number): number => (v === undefined || v === '' ? d : Number(v));
  const apiPort = num(env['PORT'], raw.apiPort);
  const publicHost = env['SERVICE_PUBLIC_HOST'] ?? raw.fleet.publicHost;
  const secure = env['SERVICE_SECURE'] === undefined ? raw.fleet.secure : env['SERVICE_SECURE'] === '1';
  return {
    ...raw,
    storageRoot: at(env['SERVICE_STORAGE'] ?? raw.storageRoot),
    apiPort,
    fleet: {
      ...raw.fleet,
      engineDir: at(env['SERVICE_ENGINE'] ?? raw.fleet.engineDir),
      viewerOut: at(raw.fleet.viewerOut),
      publicHost,
      secure,
      pageUrl: env['SERVICE_PAGE_URL'] ?? `${secure ? 'https' : 'http'}://${publicHost}:${apiPort}/play`,
    },
  };
}
