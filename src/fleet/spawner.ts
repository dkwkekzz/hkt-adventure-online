// Spawner — 엔진에 닿는 길 하나 (design/02-roles/fleet.md 의 Spawner, 흐름 3 의 5 · 7). 정적.
// 엔진의 인자는 protocol/engine.ts 가 든다. 거기 없는 인자를 쓰지 않는다. node:child_process 를 import 하는 것은 이 파일 하나다(경계 규칙 E).

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AUTH_ENV, ENGINE_TSX, ENGINE_WEB, agentArgv, devArgv } from '../protocol/engine';
import type { AgentArgs, DevArgs } from '../protocol/engine';
import { Process } from './process';

function run(engineDir: string, argv: string[], env: NodeJS.ProcessEnv): Process {
  const cwd = join(engineDir, ENGINE_WEB);
  const child = spawn(join(cwd, ENGINE_TSX), argv, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  return new Process(child);
}

export const Spawner = {
  /** missing — 엔진 체크아웃이 없으면 그 까닭, 있으면 null. Fleet 이 세울 때 묻는다. */
  missing(engineDir: string): string | null {
    const tsx = join(engineDir, ENGINE_WEB, ENGINE_TSX);
    return existsSync(tsx) ? null : `엔진이 없다 — ${tsx} (npm run engine)`;
  },

  /** host — 엔진의 dev(세계 + 뷰어). 환경에 서명 키를 둔다 — 엔진의 Gate 가 토큰만 받는다. */
  host(engineDir: string, args: DevArgs, key: string): Process {
    const env: NodeJS.ProcessEnv = { ...process.env, [AUTH_ENV]: key };
    delete env['PORT']; // dev 는 PORT 를 기본 포트로 읽는다 — 서비스의 PORT 가 새지 않게. 포트는 --port 가 준다
    return run(engineDir, devArgv(args), env);
  },

  /** agent — 엔진의 agent(FSM 두뇌로 NPC 묶음을 맡는다). 자격은 토큰 — 키는 주지 않는다. */
  agent(engineDir: string, args: AgentArgs): Process {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env[AUTH_ENV];
    return run(engineDir, agentArgv(args), env);
  },
};
