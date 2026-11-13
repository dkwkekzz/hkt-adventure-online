// CharacterStore — 캐릭터의 값을 둔다 (design/02-roles/storage.md 의 CharacterStore). 값은 파일 하나 — 안을 보지 않는다.
// 캐릭터마다 줄 하나 `{data(base64), n, at, history}` (collection `characterValues`). n 은 값을 마지막으로 쓴 lease 의 번호 —
// lease 의 줄과 값의 줄은 따로라 트랜잭션 없이 지키는 것은 이 번호다: 번호가 작은 lease 의 쓰기는 늦게 와도 덮지 못한다.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { CharacterStoreSocket, Lease } from '../protocol/storage';
import type { Docs } from './docs';
import { LEASES, held, holds } from './leases';
import type { LeaseRow } from './leases';

export const VALUES = 'characterValues';
/** 값 하나의 상한 — document 하나(16MB)에 base64 로 이력과 함께 든다. 넘는 값은 GridFS 가 필요하다(아직 없다). */
export const VALUE_LIMIT = 1024 * 1024;

interface Value {
  readonly data: string;
  readonly n: number;
  readonly at: number;
  readonly history: readonly { readonly at: number; readonly data: string }[];
}

const TRIES = 8;

export class CharacterStore implements CharacterStoreSocket {
  // 데이터 — 없음. 값은 스토리지에. docs 는 뒤(참조), keep 은 이력의 수(설정의 characterHistory)
  private readonly docs: Docs;
  private readonly keep: number;

  constructor(docs: Docs, keep: number) {
    this.docs = docs;
    this.keep = keep;
  }

  private async value(character: string): Promise<{ value: Value | null; v: number | null }> {
    const doc = await this.docs.read(VALUES, character);
    return { value: (doc?.value as Value | undefined) ?? null, v: doc?.v ?? null };
  }

  private async lease(character: string): Promise<LeaseRow | null> {
    return ((await this.docs.read(LEASES, character))?.value as LeaseRow | undefined) ?? null;
  }

  private shift(value: Value): Value['history'] {
    return this.keep <= 0 ? [] : [...value.history, { at: value.at, data: value.data }].slice(-this.keep);
  }

  async read(character: string, file: string): Promise<boolean> {
    const { value } = await this.value(character);
    if (value === null) return false;
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, Buffer.from(value.data, 'base64'));
    return true;
  }

  async write(character: string, lease: Lease, file: string): Promise<boolean> {
    if (lease.character !== character) return false;
    const body = await readFile(file);
    if (body.length > VALUE_LIMIT) throw new Error(`캐릭터의 값이 상한(${VALUE_LIMIT} 바이트)을 넘는다 — ${body.length}`);
    const data = body.toString('base64');
    for (let i = 0; i < TRIES; i++) {
      const now = await this.docs.now();
      if (!holds(await this.lease(character), lease, now)) return false; // 지금의 lease 가 아니다
      const { value, v } = await this.value(character);
      if (value !== null && value.n > lease.n) return false; // 뒤의 lease 가 이미 썼다
      const next: Value = { data, n: lease.n, at: value === null ? now : Math.max(now, value.at + 1), history: value === null ? [] : this.shift(value) };
      if (await this.docs.swap(VALUES, character, v, next)) return true;
    }
    return false;
  }

  async erase(character: string): Promise<boolean> {
    if (held(await this.lease(character), await this.docs.now())) return false;
    await this.docs.drop(VALUES, character);
    return true;
  }

  async versions(character: string): Promise<number[]> {
    const { value } = await this.value(character);
    return value === null ? [] : value.history.map((h) => h.at);
  }

  async rollback(character: string, at: number): Promise<boolean> {
    for (let i = 0; i < TRIES; i++) {
      const now = await this.docs.now();
      if (held(await this.lease(character), now)) return false;
      const { value, v } = await this.value(character);
      const then = value?.history.find((h) => h.at === at);
      if (value === null || then === undefined) return false;
      const next: Value = { data: then.data, n: value.n, at: Math.max(now, value.at + 1), history: this.shift(value) };
      if (await this.docs.swap(VALUES, character, v, next)) return true;
    }
    return false;
  }
}
