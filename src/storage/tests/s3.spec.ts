// object storage 의 뒤 — 서명(AWS Signature V4)과 S3Bucket · SnapshotStore (흐름 3 의 13 · 5 의 3 · 6 의 4 · 7 의 5).
// 서명은 AWS 문서의 예 셋과 같은가. S3Bucket 은 이 파일의 가짜 S3(http) 위에서 — 가짜는 받은 그대로의 머리 · 경로로 서명을 다시 짓고 다르면 403.
// SNAPSHOT_URI(+ S3_ENDPOINT · AWS_*)가 있으면 진짜 object storage 위에서도 같은 검사가 돈다.

import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BucketOptions } from '../../protocol/storage';
import { S3Bucket, parseSnapshotUri, signV4 } from '../s3';
import { SnapshotStore } from '../snapshot-store';
import { conformSnapshots } from './conform';

const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const EXAMPLE = { region: 'us-east-1', accessKey: 'AKIAIOSFODNN7EXAMPLE', secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', amzDate: '20130524T000000Z' };
const HOST = 'examplebucket.s3.amazonaws.com';

describe('signV4 — AWS 문서(Signature Calculations for the Authorization Header)의 예', () => {
  it('GET Object · GET Bucket Lifecycle · List Objects', () => {
    const base = { ...EXAMPLE, payloadHash: EMPTY };
    const head = (extra: Record<string, string> = {}) => ({ host: HOST, ...extra, 'x-amz-content-sha256': EMPTY, 'x-amz-date': EXAMPLE.amzDate });
    expect(signV4({ ...base, method: 'GET', path: '/test.txt', query: {}, headers: head({ range: 'bytes=0-9' }) })).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
    expect(signV4({ ...base, method: 'GET', path: '/', query: { lifecycle: '' }, headers: head() })).toMatch(/Signature=fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543$/);
    expect(signV4({ ...base, method: 'GET', path: '/', query: { 'max-keys': '2', prefix: 'J' }, headers: head() })).toMatch(/Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7$/);
  });

  it('SNAPSHOT_URI 의 모양', () => {
    expect(parseSnapshotUri('s3://b/a/b/')).toEqual({ bucket: 'b', prefix: 'a/b' });
    expect(parseSnapshotUri('s3://b')).toEqual({ bucket: 'b', prefix: '' });
    expect(() => parseSnapshotUri('https://b')).toThrow(/s3:\/\//);
  });
});

/** 가짜 S3 — path-style 의 HEAD · GET · PUT(조건 · 베낌) · DELETE · ListObjectsV2(한 쪽에 둘). 서명을 다시 지어 본다. */
function fakeS3(o: Pick<BucketOptions, 'bucket' | 'region' | 'accessKey' | 'secretKey'>): { server: Server; seen: string[] } {
  const objects = new Map<string, { body: Buffer; meta: Record<string, string>; etag: string }>();
  const seen: string[] = [];
  const body = (req: IncomingMessage): Promise<Buffer> =>
    new Promise((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });
  const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const server = createServer((req, res) => {
    void (async () => {
      const raw = req.url ?? '/';
      const [path, search = ''] = raw.split('?') as [string, string?];
      const query: Record<string, string> = {};
      for (const kv of search.split('&').filter((x) => x !== '')) {
        const [k, v = ''] = kv.split('=');
        query[decodeURIComponent(k!)] = decodeURIComponent(v);
      }
      const auth = String(req.headers['authorization'] ?? '');
      const signed = (/SignedHeaders=([^,]+)/.exec(auth)?.[1] ?? '').split(';');
      const headers = Object.fromEntries(signed.map((h) => [h, String(req.headers[h] ?? '')]));
      const want = signV4({ method: req.method!, path, query, headers, payloadHash: String(req.headers['x-amz-content-sha256']), region: o.region, accessKey: o.accessKey, secretKey: o.secretKey, amzDate: String(req.headers['x-amz-date']) });
      const data = await body(req);
      seen.push(`${req.method} ${path}`);
      if (want !== auth) return void res.writeHead(403).end('<Error><Code>SignatureDoesNotMatch</Code></Error>');
      const prefix = `/${o.bucket}`;
      if (!path.startsWith(prefix)) return void res.writeHead(404).end();
      const key = path.slice(prefix.length + 1).split('/').map(decodeURIComponent).join('/');
      const meta = Object.fromEntries(Object.entries(req.headers).filter(([k]) => k.startsWith('x-amz-meta-')).map(([k, v]) => [k, String(v)]));
      const etag = randomBytes(8).toString('hex');
      if (req.method === 'GET' && key === '' && query['list-type'] === '2') {
        const all = [...objects.keys()].filter((k) => k.startsWith(query['prefix'] ?? '')).sort();
        const from = query['continuation-token'] === undefined ? 0 : Number(query['continuation-token']);
        const page = all.slice(from, from + 2);
        const more = from + 2 < all.length;
        return void res.end(`<ListBucketResult>${page.map((k) => `<Contents><Key>${xml(k)}</Key></Contents>`).join('')}<IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${from + 2}</NextContinuationToken>` : ''}</ListBucketResult>`);
      }
      const had = objects.get(key);
      if (req.method === 'HEAD' || req.method === 'GET') {
        if (had === undefined) return void res.writeHead(404).end();
        res.writeHead(200, { etag: `"${had.etag}"`, ...had.meta });
        return void res.end(req.method === 'GET' ? had.body : undefined);
      }
      if (req.method === 'DELETE') {
        objects.delete(key);
        return void res.writeHead(204).end();
      }
      if (req.method === 'PUT') {
        const source = req.headers['x-amz-copy-source'];
        if (typeof source === 'string') {
          const from = objects.get(source.slice(prefix.length + 1).split('/').map(decodeURIComponent).join('/'));
          if (from === undefined) return void res.writeHead(404).end('<Error><Code>NoSuchKey</Code></Error>');
          objects.set(key, { body: from.body, meta, etag });
          return void res.end('<CopyObjectResult/>');
        }
        const ifMatch = req.headers['if-match'];
        if (req.headers['if-none-match'] === '*' && had !== undefined) return void res.writeHead(412).end();
        if (typeof ifMatch === 'string' && (had === undefined || `"${had.etag}"` !== ifMatch)) return void res.writeHead(412).end();
        objects.set(key, { body: data, meta, etag });
        return void res.writeHead(200, { etag: `"${etag}"` }).end();
      }
      res.writeHead(405).end();
    })();
  });
  return { server, seen };
}

describe('S3Bucket — 가짜 S3 위에서', () => {
  const o = { bucket: 'snaps', prefix: 'hkt/dev', region: 'ap-northeast-2', accessKey: 'AKIDEXAMPLE', secretKey: 'secret/with+chars', sessionToken: null };
  const fake = fakeS3(o);
  let opts: BucketOptions;
  beforeAll(async () => {
    await new Promise<void>((r) => fake.server.listen(0, '127.0.0.1', () => r()));
    const at = fake.server.address() as { port: number };
    opts = { ...o, endpoint: `http://127.0.0.1:${at.port}` };
  });
  afterAll(() => new Promise<void>((r) => fake.server.close(() => r())));

  it('올림 · 머리 · 내림 · 조건 · 베낌 · 나열(여러 쪽) · 지움. 이름은 prefix 아래, 감춰야 하는 글자도', async () => {
    const b = new S3Bucket(opts);
    expect(await b.head('w1/current.tgz')).toBeNull();
    expect(await b.put('w1/current.tgz', Buffer.from('one'), { epoch: '1', rev: 'a' }, null)).toBe(true);
    expect(await b.put('w1/current.tgz', Buffer.from('two'), { epoch: '1', rev: 'b' }, null)).toBe(false); // 없을 때만
    const h = (await b.head('w1/current.tgz'))!;
    expect(h.meta).toEqual({ epoch: '1', rev: 'a' });
    expect(await b.put('w1/current.tgz', Buffer.from('two'), { epoch: '2', rev: 'b' }, 'stale')).toBe(false);
    expect(await b.put('w1/current.tgz', Buffer.from('two'), { epoch: '2', rev: 'b' }, h.etag)).toBe(true);
    expect((await b.get('w1/current.tgz'))!.toString()).toBe('two');
    await b.copy('w1/current.tgz', 'w1/backups/a b+c.tgz', { epoch: '2' });
    await b.copy('w1/current.tgz', 'w1/backups/x.tgz', { epoch: '2' });
    await b.copy('w1/current.tgz', 'w1/backups/y.tgz', { epoch: '2' });
    await expect(b.copy('w1/none.tgz', 'w1/z.tgz', {})).rejects.toThrow(/물건이 없다/);
    expect(await b.list('w1/backups/')).toEqual(['w1/backups/a b+c.tgz', 'w1/backups/x.tgz', 'w1/backups/y.tgz']);
    expect(await b.list('w1/')).toHaveLength(4);
    await b.remove('w1/backups/x.tgz');
    await b.remove('w1/backups/never.tgz');
    expect(await b.list('w1/backups/')).toEqual(['w1/backups/a b+c.tgz', 'w1/backups/y.tgz']);
    expect(fake.seen.every((s) => s.startsWith('GET /snaps') || s.includes('/snaps/hkt/dev/'))).toBe(true);
  });

  it('자격이 틀리면 까닭을 글로 — 자격은 싣지 않는다', async () => {
    const b = new S3Bucket({ ...opts, secretKey: 'wrong' });
    const err = await b.head('w1/current.tgz').catch((e: Error) => e);
    expect(String(err)).toMatch(/object storage HEAD w1\/current.tgz — 403/);
    const put = await b.put('w1/x.tgz', Buffer.from('x'), {}).catch((e: Error) => e);
    expect(String(put)).toMatch(/403 SignatureDoesNotMatch/);
    expect(String(put)).not.toMatch(/wrong/);
  });

  conformSnapshots('object storage(가짜 S3)', (root) => new SnapshotStore(root, new S3Bucket(opts)));
});

const real = process.env['SNAPSHOT_URI'];
describe.skipIf(real === undefined || real === '')('S3Bucket — 진짜 object storage(SNAPSHOT_URI)', () => {
  const where = parseSnapshotUri(real ?? 's3://x');
  const region = process.env['AWS_REGION'] || 'us-east-1';
  const opts: BucketOptions = {
    ...where,
    prefix: `${where.prefix === '' ? '' : `${where.prefix}/`}test-${randomBytes(4).toString('hex')}`,
    endpoint: process.env['S3_ENDPOINT'] || `https://s3.${region}.amazonaws.com`,
    region,
    accessKey: process.env['AWS_ACCESS_KEY_ID'] ?? '',
    secretKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? '',
    sessionToken: process.env['AWS_SESSION_TOKEN'] || null,
  };
  conformSnapshots('object storage(SNAPSHOT_URI)', (root) => new SnapshotStore(root, new S3Bucket(opts)));
});
