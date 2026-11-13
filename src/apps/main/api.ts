// Api — 클라이언트(밖) → 앱 (design/README.md 의 Api). login 은 흐름 2, enter 는 흐름 3 의 머리. 값만 건넌다.
// 모듈에 닿는 자리는 흐름에서 트리거가 (밖)인 단계뿐이다(경계 규칙 P): Directory.resolve · Signer.issue · Signer.verify · Fleet.enter.
// 흔적(흐름 14)은 Api 가 부른 단계마다 Api 가 남긴다 — 같은 기능(Signer.verify)이 여러 흐름의 단계이므로 부른 자리가 흐름과 # 을 안다.

import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Directory, Signer } from '../../account';
import type { Fleet } from '../../fleet';
import { PROVIDERS } from '../../protocol/api';
import type { Address, EnterRequest, LoginAnswer, LoginRequest, Refusal } from '../../protocol/api';
import type { TraceFn } from '../../protocol/observe';
import { PAGE } from './page';
import type { Static } from './static';

export interface ApiParts {
  readonly directory: Directory;
  readonly signer: Signer;
  readonly fleet: Fleet;
  readonly files: Static;
  readonly log: (line: string) => void;
  /** Monitor.trace */
  readonly trace: TraceFn;
}

const freshRun = (): string => randomBytes(4).toString('hex');

const SUBJECT = /^[A-Za-z0-9_-]{8,64}$/;

/** 스토리지에 닿지 않은 거절의 머리 — 503 으로 답한다(흐름 2 의 「실패하면」). */
const UNREACHED = '스토리지에 닿지 않는다';

/** login — 흐름 2. 게스트의 주체가 비면 새로 짓는다. */
export async function login(parts: ApiParts, body: LoginRequest): Promise<LoginAnswer | Refusal> {
  const run = freshRun();
  let account: string | undefined;
  const mark = (flow: number, step: number, end: 'ok' | 'wait' | 'refused' | 'failed'): void => parts.trace({ flow, step, run, unit: '-', end, ...(account === undefined ? {} : { account }) });
  const refuse = (why: string): Refusal => {
    mark(2, 1, 'refused');
    return { why };
  };
  if (!(PROVIDERS as readonly string[]).includes(body.provider)) return refuse(`모르는 제공자 — ${body.provider}`);
  const subject = body.subject === undefined || body.subject === '' ? randomBytes(12).toString('base64url') : body.subject;
  if (!SUBJECT.test(subject)) return refuse('주체의 모양이 틀렸다');
  mark(2, 1, 'ok');
  try {
    account = await parts.directory.resolve({ provider: body.provider, subject });
  } catch (e) {
    parts.log(`api 로그인 실패 — ${(e as Error).message}`);
    mark(2, 2, 'failed');
    return { why: `${UNREACHED} — 잠시 뒤 다시` };
  }
  mark(2, 2, 'ok');
  const token = parts.signer.issue(account);
  mark(2, 4, 'ok');
  parts.trace({ flow: 2, step: 5, run, unit: '-', end: 'wait', account, person: 'login' });
  return { token, subject };
}

/** enter — 흐름 3. 토큰을 풀고 그 계정의 샤드를 세워 주소를 준다. */
export async function enter(parts: ApiParts, body: EnterRequest): Promise<Address | Refusal> {
  const run = freshRun();
  let who: { account?: string; session?: string } = {};
  const mark = (flow: number, step: number, end: 'ok' | 'wait' | 'refused'): void => parts.trace({ flow, step, run, unit: '-', end, ...who });
  mark(3, 1, 'ok');
  const account = parts.signer.verify(body.token);
  if (account !== null) who = { account };
  mark(3, 2, account === null ? 'refused' : 'ok');
  if (account === null) return { why: '토큰이 틀렸거나 만료되었다 — 다시 로그인' };
  try {
    const address = await parts.fleet.enter(account, body.token, run);
    who = { account, session: run }; // 세션 모듈(plan 05) 전에는 입장의 run 이 그 사람의 세션이다
    parts.trace({ flow: 3, step: 9, run, unit: '-', end: 'wait', ...who, person: 'pending' });
    return address;
  } catch (e) {
    parts.log(`${account} api 입장 실패 — ${(e as Error).message}`);
    mark(3, 9, 'refused'); // 답은 거절 — 까닭은 앞 단계의 흔적(6 · 14 · 16 · 17)에
    return { why: (e as Error).message };
  }
}

const readJson = (req: IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 16 * 1024) {
        reject(new Error('너무 크다'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('JSON 이 아니다'));
      }
    });
    req.on('error', reject);
  });

const send = (res: ServerResponse, code: number, value: unknown): void => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(value));
};

/** http 서버 하나 — GET / · GET /play · /viewer.js · /assets/… · /keymap.json(Static) · POST /login · POST /enter. /health 는 Monitor 의 내부 주소에. */
export function openApi(parts: ApiParts): Server {
  return createServer((req, res) => {
    void (async () => {
      const path = new URL(req.url ?? '/', 'http://x').pathname;
      if (req.method === 'GET' && path === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return void res.end(PAGE);
      }
      if (req.method === 'GET') {
        const file = parts.files.serve(path);
        if (file !== null) {
          res.writeHead(200, { 'content-type': file.type, 'cache-control': 'no-cache' });
          return void res.end(file.body);
        }
      }
      if (req.method === 'POST' && (path === '/login' || path === '/enter')) {
        let body: Record<string, unknown>;
        try {
          body = (await readJson(req)) as Record<string, unknown>;
        } catch (e) {
          return send(res, 400, { why: (e as Error).message });
        }
        const answer =
          path === '/login'
            ? await login(parts, { provider: String(body['provider'] ?? ''), subject: typeof body['subject'] === 'string' ? body['subject'] : '' })
            : await enter(parts, { token: String(body['token'] ?? '') });
        const busy = 'why' in answer && (answer.why.startsWith(UNREACHED) || (path === '/enter' && !answer.why.startsWith('토큰')));
        return send(res, 'why' in answer ? (busy ? 503 : 400) : 200, answer);
      }
      send(res, 404, { why: '없다' });
    })().catch((e: unknown) => send(res, 500, { why: (e as Error).message }));
  });
}
