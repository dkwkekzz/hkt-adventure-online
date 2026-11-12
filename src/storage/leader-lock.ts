// LeaderLock — 활성 컨트롤 플레인이 하나임을 지킨다 (design/02-roles/storage.md 의 LeaderLock).
// 줄 하나 `{holder, term, until, ttl}` (collection `leader`, key `control`). term 은 늘기만 한다 — 잡을 때마다 하나. 시각은 스토리지의 것.

import type { LeaderLockSocket } from '../protocol/storage';
import type { Docs } from './docs';

const COLL = 'leader';
const KEY = 'control';
const TRIES = 8;

interface Row {
  readonly holder: string | null;
  readonly term: number;
  readonly until: number;
  readonly ttl: number;
}

export class LeaderLock implements LeaderLockSocket {
  // 데이터 — 없음. 값은 스토리지에. docs 는 뒤(참조)
  private readonly docs: Docs;

  constructor(docs: Docs) {
    this.docs = docs;
  }

  private async row(): Promise<{ row: Row | null; v: number | null }> {
    const doc = await this.docs.read(COLL, KEY);
    return { row: (doc?.value as Row | undefined) ?? null, v: doc?.v ?? null };
  }

  async acquire(holder: string, ttl: number): Promise<number | null> {
    for (let i = 0; i < TRIES; i++) {
      const now = await this.docs.now();
      const { row, v } = await this.row();
      if (row !== null && row.holder !== null && row.holder !== holder && row.until > now) return null; // 남이 들고 있다
      const next: Row = { holder, term: (row?.term ?? 0) + 1, until: now + ttl, ttl };
      if (await this.docs.swap(COLL, KEY, v, next)) return next.term;
    }
    return null;
  }

  async renew(holder: string, term: number): Promise<boolean> {
    for (let i = 0; i < TRIES; i++) {
      const now = await this.docs.now();
      const { row, v } = await this.row();
      if (row === null || row.holder !== holder || row.term !== term || row.until <= now) return false; // 만료된 자리는 늦추지 않는다 — 다시 잡는다
      if (await this.docs.swap(COLL, KEY, v, { ...row, until: now + row.ttl })) return true;
    }
    return false;
  }

  async resign(holder: string, term: number): Promise<void> {
    for (let i = 0; i < TRIES; i++) {
      const { row, v } = await this.row();
      if (row === null || row.holder !== holder || row.term !== term) return;
      if (await this.docs.swap(COLL, KEY, v, { ...row, holder: null, until: 0 })) return;
    }
  }

  async holder(): Promise<{ holder: string; term: number } | null> {
    const now = await this.docs.now();
    const { row } = await this.row();
    return row !== null && row.holder !== null && row.until > now ? { holder: row.holder, term: row.term } : null;
  }
}
