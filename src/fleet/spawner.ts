// Spawner — 엔진에 닿는 길 하나 (design/02-roles/fleet.md 의 Spawner, 흐름 1 · 흐름 3 의 5 · 7). 정적.
// 엔진의 인자는 protocol/engine.ts 가 든다. 거기 없는 인자를 쓰지 않는다. node:child_process 를 import 하는 것은 이 파일 하나다(경계 규칙 E).

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AUTH_ENV, ENGINE_ESBUILD, ENGINE_TSX, ENGINE_WEB, agentArgv, bundleArgv, hostArgv } from '../protocol/engine';
import type { AgentArgs, HostArgs } from '../protocol/engine';
import { Process } from './process';

function run(engineDir: string, bin: string, argv: string[], env: NodeJS.ProcessEnv): Process {
  const cwd = join(engineDir, ENGINE_WEB);
  const child = spawn(join(cwd, bin), argv, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  return new Process(child);
}

export const Spawner = {
  /** missing — 엔진 체크아웃이 없으면 그 까닭, 있으면 null. Fleet 이 세울 때 묻는다. */
  missing(engineDir: string): string | null {
    const tsx = join(engineDir, ENGINE_WEB, ENGINE_TSX);
    return existsSync(tsx) ? null : `엔진이 없다 — ${tsx} (npm run engine)`;
  },

  /** bundle — 뷰어를 브라우저용 하나로 묶어 outfile 에(흐름 1). 엔진 체크아웃의 esbuild 로, 엔진의 bundle.ts 와 같은 옵션. */
  bundle(engineDir: string, outfile: string): Process {
    mkdirSync(dirname(outfile), { recursive: true });
    return run(engineDir, ENGINE_ESBUILD, bundleArgv(outfile), { ...process.env });
  },

  /** host — 엔진의 host(세계만 — 소켓 하나). 환경에 서명 키를 둔다 — 엔진의 Gate 가 토큰만 받는다. */
  host(engineDir: string, args: HostArgs, key: string): Process {
    const env: NodeJS.ProcessEnv = { ...process.env, [AUTH_ENV]: key };
    delete env['PORT']; // 서비스의 PORT 가 새지 않게. 포트는 --port 가 준다
    return run(engineDir, ENGINE_TSX, hostArgv(args), env);
  },

  /** agent — 엔진의 agent(FSM 두뇌로 NPC 묶음을 맡는다). 자격은 토큰 — 키는 주지 않는다. */
  agent(engineDir: string, args: AgentArgs): Process {
    const env: NodeJS.ProcessEnv = { ...process.env };
    delete env[AUTH_ENV];
    return run(engineDir, ENGINE_TSX, agentArgv(args), env);
  },
};
