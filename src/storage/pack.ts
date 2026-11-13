// 디렉터리 하나 ↔ 물건 하나(tar.gz) — SnapshotStore 가 Store 자리를 통째로 올리고 내린다. 파일의 안은 보지 않는다.
// tar 는 ustar, 긴 이름은 pax 머리(`path=`)로. 파일 · 디렉터리만 — 그 밖의 것(링크 등)은 거절한다. 풀 때 자리 밖으로 나가는 이름도 거절한다.

import { lstat, mkdir, readFile, readdir, utimes, writeFile } from 'node:fs/promises';
import { join, posix, relative, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const BLOCK = 512;

function octal(buf: Buffer, at: number, len: number, n: number): void {
  buf.write(n.toString(8).padStart(len - 1, '0') + '\0', at, len, 'ascii');
}

function header(name: string, size: number, mode: number, mtime: number, type: '0' | '5' | 'x', prefix = ''): Buffer {
  const h = Buffer.alloc(BLOCK);
  h.write(name, 0, 100, 'utf8');
  octal(h, 100, 8, mode);
  octal(h, 108, 8, 0);
  octal(h, 116, 8, 0);
  octal(h, 124, 12, size);
  octal(h, 136, 12, Math.floor(mtime));
  h.fill(' ', 148, 156);
  h.write(type, 156, 1, 'ascii');
  h.write('ustar\0', 257, 6, 'ascii');
  h.write('00', 263, 2, 'ascii');
  h.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return h;
}

const pad = (n: number): Buffer => Buffer.alloc((BLOCK - (n % BLOCK)) % BLOCK);

/** pax 의 기록 하나 — `<길이> path=<이름>\n`, 길이는 제 자신을 센다. */
function paxRecord(key: string, value: string): Buffer {
  const body = ` ${key}=${value}\n`;
  let len = Buffer.byteLength(body) + 1;
  while (String(len).length + Buffer.byteLength(body) !== len) len = String(len).length + Buffer.byteLength(body);
  return Buffer.from(`${len}${body}`, 'utf8');
}

function entry(path: string, size: number, mode: number, mtime: number, type: '0' | '5'): Buffer[] {
  const bytes = Buffer.byteLength(path);
  if (bytes <= 100) return [header(path, size, mode, mtime, type)];
  const cut = path.lastIndexOf('/', path.length - 1);
  if (cut > 0 && Buffer.byteLength(path.slice(0, cut)) <= 155 && Buffer.byteLength(path.slice(cut + 1)) <= 100 && path.slice(cut + 1) !== '') {
    return [header(path.slice(cut + 1), size, mode, mtime, type, path.slice(0, cut))];
  }
  const pax = paxRecord('path', path);
  return [header('pax', pax.length, 0o644, mtime, 'x'), pax, pad(pax.length), header(path.slice(-100), size, mode, mtime, type)];
}

/** dir 의 안 전부를 tar.gz 하나로. 이름은 dir 상대. */
export async function pack(dir: string): Promise<Buffer> {
  const parts: Buffer[] = [];
  const walk = async (at: string): Promise<void> => {
    for (const name of (await readdir(at)).sort()) {
      const p = join(at, name);
      const rel = relative(dir, p).split('\\').join('/');
      const st = await lstat(p);
      if (st.isDirectory()) {
        parts.push(...entry(`${rel}/`, 0, st.mode & 0o777, st.mtimeMs / 1000, '5'));
        await walk(p);
      } else if (st.isFile()) {
        const body = await readFile(p);
        parts.push(...entry(rel, body.length, st.mode & 0o777, st.mtimeMs / 1000, '0'), body, pad(body.length));
      } else throw new Error(`파일도 디렉터리도 아닌 것은 묶지 않는다 — ${rel}`);
    }
  };
  await walk(dir);
  parts.push(Buffer.alloc(BLOCK * 2));
  return gzipSync(Buffer.concat(parts));
}

const text = (b: Buffer, at: number, len: number): string => {
  const s = b.subarray(at, at + len);
  const end = s.indexOf(0);
  return s.subarray(0, end < 0 ? len : end).toString('utf8');
};
const num = (b: Buffer, at: number, len: number): number => parseInt(text(b, at, len).trim() || '0', 8);

/** tar.gz 를 dir 에 푼다 — dir 는 비어 있어야 한다. */
export async function unpack(data: Buffer, dir: string): Promise<void> {
  const tar = gunzipSync(data);
  const root = resolve(dir);
  await mkdir(root, { recursive: true });
  let at = 0;
  let longName: string | null = null;
  while (at + BLOCK <= tar.length) {
    const h = tar.subarray(at, at + BLOCK);
    if (h.every((b) => b === 0)) break;
    const size = num(h, 124, 12);
    const type = String.fromCharCode(h[156]!);
    const body = tar.subarray(at + BLOCK, at + BLOCK + size);
    at += BLOCK + size + ((BLOCK - (size % BLOCK)) % BLOCK);
    if (type === 'x') {
      for (const rec of body.toString('utf8').split('\n')) {
        const m = /^\d+ path=(.*)$/.exec(rec);
        if (m !== null) longName = m[1]!;
      }
      continue;
    }
    if (type === 'g') continue;
    const prefix = text(h, 345, 155);
    const name = longName ?? (prefix === '' ? text(h, 0, 100) : `${prefix}/${text(h, 0, 100)}`);
    longName = null;
    const clean = posix.normalize(name).replace(/\/$/, '');
    if (clean === '.' || clean === '') continue;
    const target = resolve(root, clean);
    if (clean.startsWith('../') || clean === '..' || posix.isAbsolute(clean) || (target !== root && !target.startsWith(root + '/'))) throw new Error(`자리 밖의 이름 — ${name}`);
    const mtime = num(h, 136, 12);
    if (type === '5') {
      await mkdir(target, { recursive: true });
    } else if (type === '0' || type === '\0') {
      await mkdir(resolve(target, '..'), { recursive: true });
      await writeFile(target, body, { mode: num(h, 100, 8) || 0o644 });
      await utimes(target, mtime, mtime);
    } else throw new Error(`파일도 디렉터리도 아닌 것은 풀지 않는다 — ${name} (${type})`);
  }
}
