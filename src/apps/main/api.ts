// Api — 클라이언트(밖) → 앱 (design/README.md 의 Api). login 은 흐름 2, characters · create · choose · delete 는 흐름 8, enter 는 흐름 3 의 머리. 값만 건넌다.
// 모듈에 닿는 자리는 흐름에서 Api 가 부르는 단계뿐이다(경계 규칙 P): Directory.resolve · Banlist.banned · Characters.list · create · owner · Signer.issue · verify,
// 그리고 컨트롤 플레인으로 넘는 SessionRpc 의 enter · forget(main 에서는 함수 부름).
// 흔적(흐름 14)은 Api 가 부른 단계마다 Api 가 남긴다 — 같은 기능(Signer.verify)이 여러 흐름의 단계이므로 부른 자리가 흐름과 # 을 안다.
// 사람은 계정(Account.id)을 넘겨 가명이 된다. 캐릭터의 토큰만 든 입장(흐름 3)은 계정을 모른다 — 같은 run 의 Admission.check 가 그 사람에게 잇는다.

import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { kindOf } from '../../account';
import type { Banlist, Character, Characters, Directory, Signer } from '../../account';
import { PROVIDERS } from '../../protocol/api';
import type { Address, CharactersAnswer, CharactersRequest, CharacterView, ChooseAnswer, CreateAnswer, DeleteAnswer, EnterRequest, LoginAnswer, LoginRequest, Refusal, Wait } from '../../protocol/api';
import type { TraceEnd, TraceFn } from '../../protocol/observe';
import type { SessionSocket } from '../../protocol/session';
import { PAGE } from './page';
import type { Static } from './static';

export interface ApiParts {
  readonly directory: Directory;
  readonly characters: Characters;
  readonly banlist: Banlist;
  readonly signer: Signer;
  /** SessionRpc 의 enter · forget — 컨트롤 플레인 */
  readonly session: Pick<SessionSocket, 'enter' | 'forget'>;
  /** 이 서버의 빌드 — 입장에 함께 넘긴다(흐름 3 의 1) */
  readonly build: string;
  /** 이 빌드의 뷰어 페이지(`…/play`) — 입장의 답(page)을 짓는다(흐름 3 의 9) */
  readonly pageUrl: string;
  /** 캐릭터의 토큰 수명(초) — 고르기(흐름 8 의 7) */
  readonly characterTtl: number;
  readonly files: Static;
  readonly log: (line: string) => void;
  /** Monitor.trace */
  readonly trace: TraceFn;
}

const freshRun = (): string => randomBytes(4).toString('hex');

const SUBJECT = /^[A-Za-z0-9_-]{8,64}$/;

/** 잠시 뒤 다시 — 503 으로 답한다(흐름 2 · 3 · 8 의 「실패하면」). 그 밖의 거절은 400. */
interface Busy extends Refusal {
  readonly busy: true;
}
const busy = (why: string): Busy => ({ why, busy: true });

const view = (c: Character): CharacterView => ({ id: c.id, name: c.name });

/** login — 흐름 2. 게스트의 주체가 비면 새로 짓는다. */
export async function login(parts: ApiParts, body: LoginRequest): Promise<LoginAnswer | Refusal> {
  const run = freshRun();
  let account: string | undefined;
  const mark = (flow: number, step: number, end: TraceEnd): void => parts.trace({ flow, step, run, unit: '-', end, ...(account === undefined ? {} : { account }) });
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
    return busy('스토리지에 닿지 않는다 — 잠시 뒤 다시');
  }
  mark(2, 2, 'ok');
  let banned: boolean;
  try {
    banned = await parts.banlist.banned(account);
  } catch (e) {
    parts.log(`api 로그인 실패 — ${(e as Error).message}`);
    mark(2, 3, 'failed');
    return busy('스토리지에 닿지 않는다 — 잠시 뒤 다시');
  }
  mark(2, 3, banned ? 'refused' : 'ok');
  if (banned) return { why: '차단된 계정이다' };
  const token = parts.signer.issue(account);
  mark(2, 4, 'ok');
  parts.trace({ flow: 2, step: 5, run, unit: '-', end: 'wait', account, person: 'login' });
  return { token, subject };
}

export type CharacterVerb = 'characters' | 'create' | 'choose' | 'delete';

/** characters · create · choose · delete — 흐름 8. 계정의 토큰을 풀고(2), 차단을 보고(3), 그 갈래의 단계를. 지우기의 8 ~ 11 은 컨트롤 플레인이 한 번에(SessionRpc forget). */
export async function characters(parts: ApiParts, verb: CharacterVerb, body: CharactersRequest): Promise<CharactersAnswer | CreateAnswer | ChooseAnswer | DeleteAnswer | Refusal> {
  const run = freshRun();
  let account: string | undefined;
  let name: string | undefined;
  const mark = (flow: 8, step: number, end: TraceEnd): void =>
    parts.trace({ flow, step, run, unit: '-', end, ...(account === undefined ? {} : { account }), ...(name === undefined ? {} : { name }) });
  mark(8, 1, 'ok');
  const id = parts.signer.verify(body.token);
  if (id === null || kindOf(id) !== 'account') {
    mark(8, 2, 'refused');
    return { why: '계정의 토큰이 틀렸거나 만료되었다 — 다시 로그인' };
  }
  account = id;
  mark(8, 2, 'ok');
  try {
    const banned = await parts.banlist.banned(account);
    mark(8, 3, banned ? 'refused' : 'ok');
    if (banned) return { why: '차단된 계정이다' };
    if (verb === 'characters') {
      const list = await parts.characters.list(account);
      mark(8, 4, 'wait');
      return { characters: list.map(view) };
    }
    if (verb === 'create') {
      const made = await parts.characters.create(account, body.name);
      if ('why' in made) {
        mark(8, 5, 'refused');
        return { why: made.why };
      }
      name = made.name;
      mark(8, 5, 'wait');
      return { character: view(made) };
    }
    const character = typeof body.character === 'string' ? body.character : '';
    const row = kindOf(character) === 'character' ? await parts.characters.owner(character) : null;
    if (row === null || row.account !== account) {
      mark(8, 6, 'refused');
      return { why: '이 계정의 캐릭터가 아니다' };
    }
    name = row.name;
    mark(8, 6, 'ok');
    if (verb === 'choose') {
      const token = parts.signer.issue(character, parts.characterTtl);
      mark(8, 7, 'wait');
      return { token };
    }
    const forgot = await parts.session.forget(account, character, run); // 8 ~ 11 — 흔적은 받는 쪽이
    if ('why' in forgot) return forgot.busy === true ? busy(forgot.why) : { why: forgot.why };
    return { deleted: character };
  } catch (e) {
    parts.log(`api 캐릭터 ${verb} 실패 — ${(e as Error).message}`);
    mark(8, 3, 'failed');
    return busy('스토리지에 닿지 않는다 — 잠시 뒤 다시');
  }
}

/** enter — 흐름 3 의 1 · 2 · 9 · 21. 캐릭터의 토큰을 풀고 컨트롤 플레인에 묻는다(SessionRpc enter — 3 ~ 8 · 20). page 는 이 빌드의 뷰어 페이지. */
export async function enter(parts: ApiParts, body: EnterRequest): Promise<Address | Wait | Refusal> {
  const run = freshRun();
  const mark = (flow: 3, step: number, end: TraceEnd, counts?: Record<string, number>): void => parts.trace({ flow, step, run, unit: '-', end, ...(counts === undefined ? {} : { counts }) });
  mark(3, 1, 'ok');
  const id = parts.signer.verify(body.token);
  if (id === null || kindOf(id) !== 'character') {
    mark(3, 2, 'refused');
    return { why: '캐릭터의 토큰이 틀렸거나 만료되었다 — 캐릭터를 다시 고른다' };
  }
  mark(3, 2, 'ok');
  let answer: Awaited<ReturnType<SessionSocket['enter']>>;
  try {
    answer = await parts.session.enter(id, parts.build, run);
  } catch (e) {
    parts.log(`api 입장 실패 — ${(e as Error).message}`);
    mark(3, 9, 'failed');
    return busy('컨트롤 플레인에 닿지 않는다 — 잠시 뒤 다시');
  }
  if ('why' in answer) {
    mark(3, 9, 'refused'); // 까닭은 앞 단계의 흔적(3 · 5 · 8 · 14 · 16 · 17)에
    return answer.busy === true ? busy(answer.why) : { why: answer.why };
  }
  if ('wait' in answer) {
    mark(3, 21, 'wait', { wait: answer.wait });
    return { wait: answer.wait };
  }
  mark(3, 9, 'wait');
  return { page: `${parts.pageUrl}?token=${encodeURIComponent(body.token)}&ws=${encodeURIComponent(answer.gate)}`, gate: answer.gate };
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

const VERBS: readonly string[] = ['characters', 'create', 'choose', 'delete'];

/** http 서버 하나 — GET / · GET /play · /viewer.js · /assets/… · /keymap.json(Static) · POST /login · /characters · /create · /choose · /delete · /enter. /health 는 Monitor 의 내부 주소에. */
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
      const verb = path.slice(1);
      if (req.method === 'POST' && (verb === 'login' || verb === 'enter' || VERBS.includes(verb))) {
        let body: Record<string, unknown>;
        try {
          body = (await readJson(req)) as Record<string, unknown>;
        } catch (e) {
          return send(res, 400, { why: (e as Error).message });
        }
        const str = (k: string): string => (typeof body[k] === 'string' ? (body[k] as string) : '');
        const answer =
          verb === 'login'
            ? await login(parts, { provider: str('provider'), subject: str('subject') })
            : verb === 'enter'
              ? await enter(parts, { token: str('token') })
              : await characters(parts, verb as CharacterVerb, { token: str('token'), name: str('name'), character: str('character') });
        if (!('why' in answer)) return send(res, 200, answer);
        const { busy: late, ...refusal } = answer as Refusal & { busy?: boolean };
        return send(res, late === true ? 503 : 400, refusal);
      }
      send(res, 404, { why: '없다' });
    })().catch((e: unknown) => send(res, 500, { why: (e as Error).message }));
  });
}
