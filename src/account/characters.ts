// Characters — 계정의 캐릭터를 든다 (design/02-roles/account.md 의 Characters, 흐름 8 의 4 · 5 · 6 · 9).
// 표는 메모리에 두지 않는다 — Database 의 줄 하나씩(표 `characters`: Account.id → list<Character>, 표 `owners`: Character.id → Account.id).
// API 서버 · 컨트롤 플레인이 여럿이어도 같은 답이다.

import { randomBytes } from 'node:crypto';
import type { DatabaseSocket } from '../protocol/storage';
import { nameOf } from './character';
import type { Character } from './character';
import { CHARACTER_HEAD } from './token';

/** create 의 거절 — 까닭 글. */
export interface Refused {
  readonly why: string;
}

const asList = (raw: unknown): Character[] =>
  Array.isArray(raw) ? raw.filter((c): c is Character => c !== null && typeof c === 'object' && typeof c.id === 'string' && typeof c.name === 'string') : [];

export class Characters {
  // 데이터 — db(참조) · limit(불변)
  readonly db: DatabaseSocket;
  readonly limit: number;

  /** Service.start(흐름 1 의 1) 가 만든다. */
  constructor(db: DatabaseSocket, limit: number) {
    this.db = db;
    this.limit = limit;
  }

  /** list — 그 계정의 캐릭터들. 만든 차례대로. */
  async list(account: string): Promise<Character[]> {
    return asList(await this.db.get('characters', account)).map((c) => ({ id: c.id, name: c.name, account }));
  }

  /** create — 새 Character 를 짓고 적는다. 한계를 넘거나 이름이 틀리거나 그 계정에 같은 이름이 있으면 거절. owners 를 먼저 적는다 — 반쯤 된 것은 owner 가 없는 이름으로 남지 않는다. */
  async create(account: string, raw: unknown): Promise<Character | Refused> {
    const name = nameOf(raw);
    if (name === null) return { why: '이름은 1 ~ 24 자 — 줄바꿈 · 제어 글자 없이' };
    const list = await this.list(account);
    if (list.length >= this.limit) return { why: `캐릭터는 계정마다 ${this.limit} 까지` };
    if (list.some((c) => c.name === name)) return { why: `같은 이름의 캐릭터가 있다 — ${name}` };
    let id: string;
    do id = `${CHARACTER_HEAD}${randomBytes(6).toString('hex')}`;
    while ((await this.db.get('owners', id)) !== null);
    const character: Character = { id, name, account };
    await this.db.put('owners', id, account);
    await this.db.put('characters', account, [...list, character].map((c) => ({ id: c.id, name: c.name })));
    return character;
  }

  /** owner — 그 캐릭터의 줄(계정 · 이름). 없으면 null. */
  async owner(character: string): Promise<Character | null> {
    const account = await this.db.get('owners', character);
    if (typeof account !== 'string') return null;
    return (await this.list(account)).find((c) => c.id === character) ?? null;
  }

  /** remove — 두 표에서 그 줄을 지운다. 없으면 아무것도 하지 않는다. */
  async remove(character: string): Promise<void> {
    const account = await this.db.get('owners', character);
    if (typeof account === 'string') {
      const rest = (await this.list(account)).filter((c) => c.id !== character);
      if (rest.length === 0) await this.db.remove('characters', account);
      else await this.db.put('characters', account, rest.map((c) => ({ id: c.id, name: c.name })));
    }
    await this.db.remove('owners', character);
  }
}
