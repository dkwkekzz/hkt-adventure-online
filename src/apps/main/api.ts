// Api — 클라이언트(밖) → 앱 (design/README.md 의 Api). login 은 흐름 2, enter 는 흐름 3 의 머리. 값만 건넌다.
// 모듈에 닿는 자리는 흐름에서 트리거가 (밖)인 단계뿐이다(경계 규칙 P): Directory.resolve · Signer.issue · Signer.verify · Fleet.enter.

import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Directory, Signer } from '../../account';
import type { Fleet } from '../../fleet';
import { PROVIDERS } from '../../protocol/api';
import type { Address, EnterRequest, LoginAnswer, LoginRequest, Refusal } from '../../protocol/api';
import { PAGE } from './page';

export interface ApiParts {
  readonly directory: Directory;
  readonly signer: Signer;
  readonly fleet: Fleet;
  readonly log: (line: string) => void;
}

const SUBJECT = /^[A-Za-z0-9_-]{8,64}$/;

/** login — 흐름 2. 게스트의 주체가 비면 새로 짓는다. */
export function login(parts: ApiParts, body: LoginRequest): LoginAnswer | Refusal {
  if (!(PROVIDERS as readonly string[]).includes(body.provider)) return { why: `모르는 제공자 — ${body.provider}` };
  const subject = body.subject === undefined || body.subject === '' ? randomBytes(12).toString('base64url') : body.subject;
  if (!SUBJECT.test(subject)) return { why: '주체의 모양이 틀렸다' };
  const account = parts.directory.resolve({ provider: body.provider, subject });
  return { token: parts.signer.issue(account), subject };
}

/** enter — 흐름 3. 토큰을 풀고 그 계정의 샤드를 세워 주소를 준다. */
export async function enter(parts: ApiParts, body: EnterRequest): Promise<Address | Refusal> {
  const account = parts.signer.verify(body.token);
  if (account === null) return { why: '토큰이 틀렸거나 만료되었다 — 다시 로그인' };
  try {
    return await parts.fleet.enter(account, body.token);
  } catch (e) {
    parts.log(`${account} api 입장 실패 — ${(e as Error).message}`);
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

/** http 서버 하나 — GET / · GET /health · POST /login · POST /enter. */
export function openApi(parts: ApiParts): Server {
  return createServer((req, res) => {
    void (async () => {
      const path = new URL(req.url ?? '/', 'http://x').pathname;
      if (req.method === 'GET' && path === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return void res.end(PAGE);
      }
      if (req.method === 'GET' && path === '/health') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        return void res.end('ok');
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
            ? login(parts, { provider: String(body['provider'] ?? ''), subject: typeof body['subject'] === 'string' ? body['subject'] : '' })
            : await enter(parts, { token: String(body['token'] ?? '') });
        return send(res, 'why' in answer ? (path === '/enter' && !answer.why.startsWith('토큰') ? 503 : 400) : 200, answer);
      }
      send(res, 404, { why: '없다' });
    })().catch((e: unknown) => send(res, 500, { why: (e as Error).message }));
  });
}
