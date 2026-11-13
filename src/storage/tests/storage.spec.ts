// openStorage 의 디렉터리의 뒤(개발) — Database · Leases · CharacterStore · LeaderLock · SnapshotStore (흐름 1 의 1 · 3 의 13 · 5 의 3 · 6 의 3 · 4 · 7 의 5 · 11).
// 모양은 MongoDB · object storage 의 뒤와 같다 — 같은 검사(conform.ts)가 mongo.spec.ts · s3.spec.ts 에서도 돈다.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openStorage } from '..';
import { DirBucket } from '../bucket';
import { fileOfKey, keyOfFile } from '../docs';
import { pack, unpack } from '../pack';
import { SnapshotStore } from '../snapshot-store';
import { conformDocs, conformSnapshots, scratch } from './conform';

const LEASE = 200;
const shared = scratch('storage');
const options = (root: string) => ({ root, mongodbUri: null, bucket: null, leaseMs: LEASE, characterHistory: 2 });

conformDocs('디렉터리', () => openStorage(options(shared)), LEASE);

// 서버 둘이 같은 remote 를 쓰는 것 — 디렉터리의 물건 하나를 서버마다의 local 이 함께 쓴다
const remote = new DirBucket(scratch('remote'));
conformSnapshots('디렉터리', (root) => new SnapshotStore(root, remote));

describe('openStorage — 흐름 1 의 1', () => {
  it('디렉터리의 뒤 — 줄은 <root>/db/<표>/<key>.json, 열쇠는 되돌릴 수 있는 이름. where 는 자리를 말한다', async () => {
    const root = scratch('storage-layout');
    const s = await openStorage(options(root));
    await s.database.put('accounts', 'guest:a/b.c', 'p1');
    expect(readdirSync(join(root, 'db', 'accounts'))).toEqual([fileOfKey('guest:a/b.c')]);
    expect(fileOfKey('guest:a/b.c')).not.toMatch(/[/.](?!json$)/);
    expect(keyOfFile(fileOfKey('../x~y'))).toBe('../x~y');
    expect(JSON.parse(readFileSync(join(root, 'db', 'accounts', fileOfKey('guest:a/b.c')), 'utf8'))).toEqual({ v: 1, value: 'p1' });
    expect(s.where).toBe(`디렉터리 ${root} · Store 디렉터리`);
    await s.close();
  });
});

describe('pack · unpack — Store 자리를 통째로', () => {
  it('디렉터리 · 긴 이름(ustar 의 prefix · pax)을 그대로 되살린다. 자리 밖의 이름은 거절', async () => {
    const from = scratch('pack');
    const deep = join(from, 'regions', 'd'.repeat(120));
    mkdirSync(deep, { recursive: true });
    writeFileSync(join(from, 'snapshot.json'), '{"now":1}');
    writeFileSync(join(deep, `${'f'.repeat(130)}.json`), 'long');
    mkdirSync(join(from, 'empty'));
    const to = join(scratch('unpack'), 'store');
    await unpack(await pack(from), to);
    expect(readFileSync(join(to, 'snapshot.json'), 'utf8')).toBe('{"now":1}');
    expect(readFileSync(join(to, 'regions', 'd'.repeat(120), `${'f'.repeat(130)}.json`), 'utf8')).toBe('long');
    expect(readdirSync(join(to, 'empty'))).toEqual([]);

    // 이름이 ../ 인 tar 를 손으로 — 풀지 않는다
    const evil = scratch('evil');
    writeFileSync(join(evil, 'x'), 'x');
    const tgz = await pack(evil);
    const { gunzipSync, gzipSync } = await import('node:zlib');
    const tar = gunzipSync(tgz);
    tar.write('../x\0', 0, 'utf8');
    let sum = 0;
    tar.fill(' ', 148, 156);
    for (const b of tar.subarray(0, 512)) sum += b;
    tar.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    await expect(unpack(gzipSync(tar), join(scratch('unpack'), 'store'))).rejects.toThrow(/자리 밖의 이름/);
  });
});
