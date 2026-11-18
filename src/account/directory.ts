// Directory — 신원을 Account.id 로 (design/02-roles/account.md 의 Directory, 흐름 2 의 2).
// 표는 메모리에 두지 않는다 — Database 의 줄 하나씩(표 `accounts`: Identity.key → Account.id, 표 `accountInfo`: Account.id → 마지막으로 온 때).
// API 서버가 여럿이어도 같은 답이다.

import { randomBytes } from 'node:crypto';
import type { DatabaseSocket } from '../protocol/storage';
import { ACCOUNT_HEAD } from './token';
import { keyOf } from './identity';
import type { Identity } from './identity';

/** 표 `accountInfo` 의 줄. */
export interface AccountInfo {
  readonly seen: number;
}

export class Directory {
  // 데이터 — db(참조)
  readonly db: DatabaseSocket;
  private readonly now: () => number;

  /** Service.start(흐름 1 의 1) 가 만든다. */
  constructor(db: DatabaseSocket, now: () => number = Date.now) {
    this.db = db;
    this.now = now;
  }

  /** resolve — 있으면 그 id, 없으면 새 id(`a` 로 시작)를 짓고 적는다. 마지막으로 온 때를 고친다. */
  async resolve(identity: Identity): Promise<string> {
    const key = keyOf(identity);
    let id = await this.idOf(identity);
    if (id === null) {
      do id = `${ACCOUNT_HEAD}${randomBytes(6).toString('hex')}`;
      while ((await this.db.get('accountInfo', id)) !== null);
      await this.db.put('accountInfo', id, { seen: this.now() } satisfies AccountInfo);
      await this.db.put('accounts', key, id);
      return id;
    }
    await this.db.put('accountInfo', id, { seen: this.now() } satisfies AccountInfo);
    return id;
  }

  /**
   * sweep — 흐름 5 의 15. 캐릭터가 없고 before 보다 오래 오지 않은 계정을 지운다(표 accounts · accountInfo · characters 의 그 줄). 지운 수.
   * 차단(bans)은 남긴다 — 같은 주체가 돌아와도 새 계정이라 닿지 않는다.
   */
  async sweep(before: number): Promise<number> {
    let removed = 0;
    for (const [key, raw] of await this.db.all('accounts')) {
      if (typeof raw !== 'string') continue;
      const info = (await this.db.get('accountInfo', raw)) as AccountInfo | null;
      const chars = (await this.db.get('characters', raw)) as unknown[] | null;
      if ((chars !== null && chars.length > 0) || (info !== null && info.seen >= before)) continue;
      await this.db.remove('accounts', key);
      await this.db.remove('accountInfo', raw);
      await this.db.remove('characters', raw);
      removed++;
    }
    return removed;
  }

  /** idOf — 있는 것만. */
  async idOf(identity: Identity): Promise<string | null> {
    const id = await this.db.get('accounts', keyOf(identity));
    return typeof id === 'string' ? id : null;
  }
}
