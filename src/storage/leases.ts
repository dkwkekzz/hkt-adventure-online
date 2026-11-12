// Leases — 캐릭터의 값을 지금 누가 들고 있는가를 든다 (design/02-roles/storage.md 의 Leases). 캐릭터 하나의 값은 한때에 인스턴스 하나만 든다.
// 캐릭터마다 줄 하나 `{holder, n, until}` (collection `leases`). 바꿈은 전부 v 를 건 swap — 둘이 동시에 잡으면 하나만 된다.
// 비울 때마다 n 이 오른다 — 앞의 lease 로 하는 뒤늦은 저장(CharacterStore.write)은 거절된다. 시각은 스토리지의 것.

import type { Lease, LeasesSocket } from '../protocol/storage';
import type { Docs } from './docs';

export const LEASES = 'leases';

/** 스토리지의 줄 — holder 가 null 이면 비었다. */
export interface LeaseRow {
  readonly holder: string | null;
  readonly n: number;
  readonly until: number;
}

/** 줄이 그 lease 의 것이고 만료 전인가. */
export const holds = (row: LeaseRow | null, lease: Pick<Lease, 'holder' | 'n'>, now: number): boolean =>
  row !== null && row.holder === lease.holder && row.n === lease.n && row.until > now;

/** 누가 들고 있는가(만료 전). */
export const held = (row: LeaseRow | null, now: number): boolean => row !== null && row.holder !== null && row.until > now;

const TRIES = 8;

export class Leases implements LeasesSocket {
  // 데이터 — 없음. 값은 스토리지에. docs 는 뒤(참조), ms 는 lease 의 길이(설정의 leaseMs)
  private readonly docs: Docs;
  private readonly ms: number;

  constructor(docs: Docs, ms: number) {
    this.docs = docs;
    this.ms = ms;
  }

  async row(character: string): Promise<{ row: LeaseRow | null; v: number | null }> {
    const doc = await this.docs.read(LEASES, character);
    return { row: (doc?.value as LeaseRow | undefined) ?? null, v: doc?.v ?? null };
  }

  async acquire(character: string, holder: string): Promise<Lease | null> {
    for (let i = 0; i < TRIES; i++) {
      const now = await this.docs.now();
      const { row, v } = await this.row(character);
      if (held(row, now)) return null;
      const next: LeaseRow = { holder, n: (row?.n ?? 0) + 1, until: now + this.ms };
      if (await this.docs.swap(LEASES, character, v, next)) return { character, holder, n: next.n, until: next.until };
    }
    return null; // 다툼에 졌다 — 누군가 잡았다
  }

  async renew(lease: Lease): Promise<Lease | null> {
    for (let i = 0; i < TRIES; i++) {
      const now = await this.docs.now();
      const { row, v } = await this.row(lease.character);
      if (!holds(row, lease, now)) return null;
      const next: LeaseRow = { ...row!, until: now + this.ms };
      if (await this.docs.swap(LEASES, lease.character, v, next)) return { ...lease, until: next.until };
    }
    return null;
  }

  async release(lease: Lease): Promise<void> {
    await this.empty(lease.character, (row) => row.holder === lease.holder && row.n === lease.n);
  }

  async expire(holder: string): Promise<void> {
    for (const [character] of await this.docs.scan(LEASES, { field: 'holder', is: holder })) await this.empty(character, (row) => row.holder === holder);
  }

  /** 그 줄이 mine 이면 비운다 — 번호가 하나 오른다. */
  private async empty(character: string, mine: (row: LeaseRow) => boolean): Promise<void> {
    for (let i = 0; i < TRIES; i++) {
      const { row, v } = await this.row(character);
      if (row === null || !mine(row)) return;
      if (await this.docs.swap(LEASES, character, v, { holder: null, n: row.n + 1, until: 0 } satisfies LeaseRow)) return;
    }
  }
}
