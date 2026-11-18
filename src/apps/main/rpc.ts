// 내부망의 글 — SessionRpc · NodeRpc · Operator 를 프로세스 사이에 나른다 (design/README.md 의 연결 여덟). 앱의 것이다 — 모듈은 소켓(함수)만 안다.
// 글 하나 = `POST /rpc/<이름>` 의 JSON `{args, run, term}` → `{result}`. 글마다 한계(limitMs)가 있고, 답이 없으면 실패로 친다(그 흐름의 「실패하면」).
// 컨트롤 플레인이 보내는 글에는 term 이 실린다 — 받는 쪽은 본 것보다 작은 term 의 글을 버린다(409). 받을 수 없는 때(대기의 컨트롤 플레인)는 503 — 보내는 쪽이 활성을 다시 찾는다.

import { createServer } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';

/** 글마다 실리는 것 — 그 흐름의 run 과 보낸 컨트롤 플레인의 term(노드 · 게이트웨이 · API 서버가 보내는 글은 0). */
export interface RpcMeta {
  readonly run: string;
  readonly term: number;
}

/** 받는 쪽의 일 하나 — args 는 소켓의 인자 그대로(JSON). */
export type RpcHandler = (args: unknown[], meta: RpcMeta) => unknown;

/** 받을 수 없다 — code 와 까닭. */
export interface RpcRefusal {
  readonly code: 409 | 503;
  readonly why: string;
}

/** 보낸 글이 받히지 않았다 — 503(대기 · 내려가는 가운데) · 409(낡은 term) · 닿지 않음 · 한계. */
export class RpcError extends Error {
  readonly code: number;
  constructor(code: number, why: string) {
    super(why);
    this.code = code;
  }
}

const readBody = (req: IncomingMessage, limit: number): Promise<string> =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('글이 크다'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });

/**
 * serveRpc — 받는 쪽의 http 하나. guard 가 까닭을 주면 그 글을 받지 않는다(409 · 503). operator 가 있으면 `POST /operator`(머리 `authorization: Bearer <토큰>`, 몸은 글 한 줄 → 답 글 한 줄).
 */
export function serveRpc(handlers: Readonly<Record<string, RpcHandler>>, guard: (name: string, meta: RpcMeta) => RpcRefusal | null = () => null, operator?: (token: string, line: string) => Promise<string>): Server {
  return createServer((req, res) => {
    void (async () => {
      const path = new URL(req.url ?? '/', 'http://x').pathname;
      if (req.method !== 'POST') return void res.writeHead(405).end();
      if (path === '/operator' && operator !== undefined) {
        const token = (req.headers['authorization'] ?? '').replace(/^Bearer\s+/i, '');
        const line = (await readBody(req, 64 * 1024)).trim();
        const answer = await operator(token, line);
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        return void res.end(answer);
      }
      const name = path.startsWith('/rpc/') ? path.slice('/rpc/'.length) : '';
      const handler = handlers[name];
      if (handler === undefined) return void res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ why: `모르는 글 ${name}` }));
      let body: { args?: unknown; run?: unknown; term?: unknown };
      try {
        body = JSON.parse(await readBody(req, 16 * 1024 * 1024)) as typeof body;
      } catch {
        return void res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ why: '글이 아니다' }));
      }
      const meta: RpcMeta = { run: typeof body.run === 'string' ? body.run : '-', term: typeof body.term === 'number' ? body.term : 0 };
      const refused = guard(name, meta);
      if (refused !== null) return void res.writeHead(refused.code, { 'content-type': 'application/json' }).end(JSON.stringify({ why: refused.why }));
      const result = await handler(Array.isArray(body.args) ? body.args : [], meta);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ result: result === undefined ? null : result }));
    })().catch((e: unknown) => {
      if (res.headersSent) return void res.end();
      res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ why: (e as Error).message }));
    });
  });
}

/** call — 그 주소에 글 하나. 답의 result, 받히지 않으면 RpcError(code 0 은 닿지 않음 · 한계). */
export async function call(address: string, name: string, args: readonly unknown[], meta: RpcMeta, limitMs: number): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${address.replace(/\/$/, '')}/rpc/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ args, run: meta.run, term: meta.term }),
      signal: AbortSignal.timeout(limitMs),
    });
  } catch (e) {
    throw new RpcError(0, `${address} 에 닿지 않는다 — ${(e as Error).name === 'TimeoutError' ? `${limitMs}ms 안에 답이 없다` : (e as Error).message}`);
  }
  const body = (await res.json().catch(() => ({}))) as { result?: unknown; why?: string };
  if (!res.ok) throw new RpcError(res.status, body.why ?? `http ${res.status}`);
  return body.result ?? null;
}

/** listen — 그 포트(0 이면 빈 것)에 열고 연 포트를 준다. */
export function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      const at = server.address();
      resolve(typeof at === 'object' && at !== null ? at.port : port);
    });
  });
}
