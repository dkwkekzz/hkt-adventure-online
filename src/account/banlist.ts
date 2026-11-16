// Banlist — 차단된 계정을 든다 (design/02-roles/account.md 의 Banlist, 흐름 2 의 3 · 흐름 8 의 3 · 흐름 3 의 3).
// 표는 메모리에 두지 않는다 — 표 `bans`: Account.id → until(ms). 차단을 운영자가 적으면 다음 물음부터 거절된다.

import type { DatabaseSocket } from '../protocol/storage';

export class Banlist {
  // 데이터 — db(참조)
  readonly db: DatabaseSocket;
  private readonly now: () => number;

  /** Service.start(흐름 1 의 1) 가 만든다. */
  constructor(db: DatabaseSocket, now: () => number = Date.now) {
    this.db = db;
    this.now = now;
  }

  /** ban — until(ms) 까지 차단한다. */
  async ban(account: string, until: number): Promise<void> {
    await this.db.put('bans', account, until);
  }

  async unban(account: string): Promise<void> {
    await this.db.remove('bans', account);
  }

  /** banned — until 이 지금보다 뒤면 차단됐다. */
  async banned(account: string): Promise<boolean> {
    const until = await this.db.get('bans', account);
    return typeof until === 'number' && until > this.now();
  }
}
