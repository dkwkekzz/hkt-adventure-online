// Directory — 신원을 Account.id 로 (design/02-roles/account.md 의 Directory, 흐름 2 의 2).
// 사용자 표는 저장장치의 `directory` 자리에 — Ledger 소켓으로만 닿는다.

import { randomBytes } from 'node:crypto';
import type { LedgerSocket } from '../protocol/vault';
import { keyOf } from './identity';
import type { Identity } from './identity';

/** 저장의 모양 — `directory` 자리의 값. */
export interface DirectorySnapshot {
  readonly users: Record<string, string>;
}

export class Directory {
  // 데이터 — users · ledger(참조)
  readonly users: Map<string, string>;
  readonly ledger: LedgerSocket;

  /** Service.start(흐름 1 의 3) — Ledger 의 값으로 만든다. */
  constructor(ledger: LedgerSocket) {
    this.ledger = ledger;
    const saved = ledger.load('directory') as DirectorySnapshot | null;
    this.users = new Map(Object.entries(saved?.users ?? {}));
  }

  /** resolve — 있으면 그 id, 없으면 새 id 를 짓고 적고 Ledger.save. */
  resolve(identity: Identity): string {
    const key = keyOf(identity);
    const had = this.users.get(key);
    if (had !== undefined) return had;
    const taken = new Set(this.users.values());
    let id = '';
    do id = `p${randomBytes(6).toString('hex')}`;
    while (taken.has(id));
    this.users.set(key, id);
    this.ledger.save('directory', this.snapshot());
    return id;
  }

  /** idOf — 있는 것만. */
  idOf(identity: Identity): string | null {
    return this.users.get(keyOf(identity)) ?? null;
  }

  snapshot(): DirectorySnapshot {
    return { users: Object.fromEntries(this.users) };
  }
}
