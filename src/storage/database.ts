// Database — 표의 줄을 읽고 쓴다 (design/02-roles/storage.md 의 Database). 표 하나 = collection 하나, 줄 하나 = document 하나.
// 뒤는 문서의 모양(docs.ts) — MongoDB 또는 디렉터리. 줄 하나의 쓰기는 통째로 되거나 안 된다.

import { TABLES } from '../protocol/storage';
import type { DatabaseSocket, Table } from '../protocol/storage';
import type { Docs } from './docs';

const checkTable = (table: Table): Table => {
  if (!(TABLES as readonly string[]).includes(table)) throw new Error(`표가 아니다 — ${table}`);
  return table;
};

export class Database implements DatabaseSocket {
  // 데이터 — 없음. 값은 스토리지에. docs 는 뒤(참조)
  private readonly docs: Docs;

  constructor(docs: Docs) {
    this.docs = docs;
  }

  async get(table: Table, key: string): Promise<unknown> {
    return (await this.docs.read(checkTable(table), key))?.value ?? null;
  }

  put(table: Table, key: string, value: unknown): Promise<void> {
    return this.docs.write(checkTable(table), key, value);
  }

  remove(table: Table, key: string): Promise<void> {
    return this.docs.drop(checkTable(table), key);
  }

  all(table: Table): Promise<[string, unknown][]> {
    return this.docs.scan(checkTable(table));
  }
}
