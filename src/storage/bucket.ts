// 물건의 뒤 — SnapshotStore 의 remote 가 아는 모양 (design/02-roles/storage.md 「개념은 뒤의 모양 둘만 안다」).
// 물건 하나 = 이름 · 몸(바이트) · 글 몇 개(meta) · etag. 올림은 「지금 것이 이것일 때만」을 단다 — 몸과 meta 가 함께 되거나 안 된다.
// 뒤는 둘: 디렉터리(DirBucket, 개발 — 여기)와 object storage(S3Bucket — s3.ts).
//
//   <root>/bucket/<이름>      [meta 의 길이 4 바이트][meta JSON {etag, meta}][몸]

import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { Serial, missing } from './docs';

export interface Head {
  readonly etag: string;
  readonly meta: Readonly<Record<string, string>>;
}

export interface Bucket {
  head(key: string): Promise<Head | null>;
  get(key: string): Promise<Buffer | null>;
  /** 올린다. when 이 undefined 면 조건 없이, null 이면 없을 때만, 글이면 etag 가 그것일 때만 — 조건이 틀리면 false. */
  put(key: string, body: Buffer, meta: Readonly<Record<string, string>>, when?: string | null): Promise<boolean>;
  /** from 을 to 로 베낀다 — meta 는 새로. from 이 없으면 던진다. */
  copy(from: string, to: string, meta: Readonly<Record<string, string>>): Promise<void>;
  /** 이름이 prefix 로 시작하는 물건들 — 이름 순. */
  list(prefix: string): Promise<string[]>;
  remove(key: string): Promise<void>;
}

/** 물건의 이름 — 조각마다 비지 않고 `.` 으로 시작하지 않는다. 경로를 넘지 않는다. */
export function checkKey(key: string): string {
  const parts = key.split('/');
  if (key === '' || parts.some((p) => p === '' || p.startsWith('.') || p.includes('\\'))) throw new Error(`물건의 이름이 아니다 — ${key}`);
  return key;
}

/** 디렉터리의 뒤 — 프로세스 하나가 쓴다(개발). 쓰기는 옆 파일에 쓰고 이름을 바꾼다. */
export class DirBucket implements Bucket {
  readonly dir: string;
  private readonly serial = new Serial();

  constructor(root: string) {
    this.dir = join(root, 'bucket');
  }

  private fileOf(key: string): string {
    return join(this.dir, checkKey(key));
  }

  private async readHead(file: string): Promise<{ head: Head; at: number } | null> {
    let fd;
    try {
      fd = await open(file, 'r');
    } catch (e) {
      if (missing(e)) return null;
      throw e;
    }
    try {
      const len = Buffer.alloc(4);
      await fd.read(len, 0, 4, 0);
      const n = len.readUInt32BE(0);
      const raw = Buffer.alloc(n);
      await fd.read(raw, 0, n, 4);
      return { head: JSON.parse(raw.toString('utf8')) as Head, at: 4 + n };
    } finally {
      await fd.close();
    }
  }

  async head(key: string): Promise<Head | null> {
    return (await this.readHead(this.fileOf(key)))?.head ?? null;
  }

  async get(key: string): Promise<Buffer | null> {
    const file = this.fileOf(key);
    const head = await this.readHead(file);
    if (head === null) return null;
    return (await readFile(file)).subarray(head.at);
  }

  private async store(file: string, body: Buffer, meta: Readonly<Record<string, string>>): Promise<void> {
    const raw = Buffer.from(JSON.stringify({ etag: randomBytes(8).toString('hex'), meta }), 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(raw.length, 0);
    await mkdir(dirname(file), { recursive: true });
    const tmp = join(dirname(file), `.${randomBytes(6).toString('hex')}.tmp`);
    await writeFile(tmp, Buffer.concat([len, raw, body]));
    await rename(tmp, file);
  }

  put(key: string, body: Buffer, meta: Readonly<Record<string, string>>, when?: string | null): Promise<boolean> {
    const file = this.fileOf(key);
    return this.serial.run(key, async () => {
      if (when !== undefined) {
        const had = await this.readHead(file);
        if ((had?.head.etag ?? null) !== when) return false;
      }
      await this.store(file, body, meta);
      return true;
    });
  }

  async copy(from: string, to: string, meta: Readonly<Record<string, string>>): Promise<void> {
    const body = await this.get(from);
    if (body === null) throw new Error(`물건이 없다 — ${from}`);
    const file = this.fileOf(to);
    await this.serial.run(to, () => this.store(file, body, meta));
  }

  async list(prefix: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      let names: string[];
      try {
        names = await readdir(dir);
      } catch (e) {
        if (missing(e)) return;
        throw e;
      }
      for (const name of names) {
        if (name.startsWith('.')) continue; // 쓰는 가운데의 옆 파일
        const p = join(dir, name);
        if ((await stat(p)).isDirectory()) await walk(p);
        else {
          const key = relative(this.dir, p).split('\\').join('/');
          if (key.startsWith(prefix)) out.push(key);
        }
      }
    };
    const at = prefix.lastIndexOf('/');
    await walk(at < 0 ? this.dir : join(this.dir, checkKey(prefix.slice(0, at))));
    return out.sort();
  }

  async remove(key: string): Promise<void> {
    const file = this.fileOf(key);
    await this.serial.run(key, () => rm(file, { force: true }));
  }
}
