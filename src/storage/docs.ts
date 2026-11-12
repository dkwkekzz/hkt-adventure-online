// 문서의 뒤 — Database · CharacterStore · Leases · LeaderLock 이 아는 모양 (design/02-roles/storage.md 「개념은 뒤의 모양 둘만 안다」).
// 줄 하나 = {value, v}. v 는 쓸 때마다 하나 오른다 — swap 은 v 가 같을 때만 바꾼다(원자적 갱신 하나, 트랜잭션 없음).
// 뒤는 둘: 디렉터리(DirDocs, 개발 — 여기)와 MongoDB(MongoDocs — mongo.ts).
//
//   <root>/db/<표>/<key 를 이름으로>.json      {"v": n, "value": …}

import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface Doc {
  readonly value: unknown;
  readonly v: number;
}

export interface Docs {
  read(coll: string, key: string): Promise<Doc | null>;
  /** 통째로 쓴다 — 있든 없든. */
  write(coll: string, key: string, value: unknown): Promise<void>;
  /** v 가 같을 때만 쓴다 — v 가 null 이면 줄이 없을 때만. 되면 true. */
  swap(coll: string, key: string, v: number | null, value: unknown): Promise<boolean>;
  drop(coll: string, key: string): Promise<void>;
  /** 줄 전부 — where 가 있으면 value[field] === is 인 것만. */
  scan(coll: string, where?: { readonly field: string; readonly is: unknown }): Promise<[string, unknown][]>;
  /** 스토리지의 시각(ms). */
  now(): Promise<number>;
  close(): Promise<void>;
}

/** key → 파일 이름. 되돌릴 수 있고, 경로를 넘지 않는다(`/` · `.` · `\` 도 감춘다). */
export const fileOfKey = (key: string): string =>
  encodeURIComponent(key).replace(/[.!'()*~]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`) + '.json';
export const keyOfFile = (file: string): string => decodeURIComponent(file.slice(0, -'.json'.length));

/** 이름마다 일을 차례로 — 한 프로세스 안의 원자성(디렉터리의 뒤). */
export class Serial {
  private readonly tails = new Map<string, Promise<unknown>>();

  run<T>(id: string, work: () => Promise<T>): Promise<T> {
    const before = this.tails.get(id) ?? Promise.resolve();
    const next = before.then(work, work);
    const tail = next.catch(() => {});
    this.tails.set(id, tail);
    void tail.then(() => {
      if (this.tails.get(id) === tail) this.tails.delete(id);
    });
    return next;
  }

  async idle(): Promise<void> {
    await Promise.all([...this.tails.values()]);
  }
}

export const missing = (e: unknown): boolean => (e as NodeJS.ErrnoException).code === 'ENOENT';

/** 디렉터리의 뒤 — 프로세스 하나가 쓴다(개발). 줄 하나의 쓰기는 옆 파일에 쓰고 이름을 바꾼다 — 반쯤 쓴 줄이 남지 않는다. */
export class DirDocs implements Docs {
  readonly dir: string;
  private readonly serial = new Serial();
  private seq = 0;

  constructor(root: string) {
    this.dir = join(root, 'db');
  }

  private collDir(coll: string): string {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(coll)) throw new Error(`표의 이름이 아니다 — ${coll}`);
    return join(this.dir, coll);
  }

  private fileOf(coll: string, key: string): string {
    return join(this.collDir(coll), fileOfKey(key));
  }

  /** 같은 줄의 일은 차례로 — swap 이 읽고 쓰는 사이에 다른 쓰기가 끼지 않는다. */
  private locked<T>(coll: string, key: string, work: () => Promise<T>): Promise<T> {
    return this.serial.run(`${coll}\u0000${key}`, work);
  }

  private async load(file: string): Promise<Doc | null> {
    try {
      const raw = JSON.parse(await readFile(file, 'utf8')) as { v?: number; value?: unknown };
      return { value: raw.value ?? null, v: raw.v ?? 1 };
    } catch (e) {
      if (missing(e)) return null;
      throw e;
    }
  }

  private async store(file: string, doc: Doc): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${this.seq++}.tmp`;
    await writeFile(tmp, JSON.stringify(doc) + '\n');
    await rename(tmp, file);
  }

  read(coll: string, key: string): Promise<Doc | null> {
    return this.load(this.fileOf(coll, key));
  }

  write(coll: string, key: string, value: unknown): Promise<void> {
    const file = this.fileOf(coll, key);
    return this.locked(coll, key, async () => {
      const had = await this.load(file);
      await this.store(file, { value, v: (had?.v ?? 0) + 1 });
    });
  }

  swap(coll: string, key: string, v: number | null, value: unknown): Promise<boolean> {
    const file = this.fileOf(coll, key);
    return this.locked(coll, key, async () => {
      const had = await this.load(file);
      if ((had?.v ?? null) !== v) return false;
      await this.store(file, { value, v: (v ?? 0) + 1 });
      return true;
    });
  }

  drop(coll: string, key: string): Promise<void> {
    const file = this.fileOf(coll, key);
    return this.locked(coll, key, () => rm(file, { force: true }));
  }

  async scan(coll: string, where?: { readonly field: string; readonly is: unknown }): Promise<[string, unknown][]> {
    const dir = this.collDir(coll);
    let names: string[];
    try {
      names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort();
    } catch (e) {
      if (missing(e)) return [];
      throw e;
    }
    const out: [string, unknown][] = [];
    for (const name of names) {
      const doc = await this.load(join(dir, name));
      if (doc === null) continue;
      if (where !== undefined && (doc.value as Record<string, unknown> | null)?.[where.field] !== where.is) continue;
      out.push([keyOfFile(name), doc.value]);
    }
    return out;
  }

  now(): Promise<number> {
    return Promise.resolve(Date.now());
  }

  close(): Promise<void> {
    return this.serial.idle();
  }
}
