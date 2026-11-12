// object storage(S3 호환)의 뒤 — 물건의 모양(bucket.ts 의 Bucket)을 S3 의 http 위에 (design/02-roles/storage.md 의 「뒤」 칸).
// 서명은 AWS Signature V4 를 node 의 crypto 로 — SDK 를 쓰지 않는다. 부름은 path-style(`<endpoint>/<bucket>/<이름>`)이라 MinIO 같은 S3 호환에도 같다.
// 조건 붙은 올림은 If-Match · If-None-Match(412 면 false). 자격은 흔적 · 글에 싣지 않는다.

import { createHash, createHmac } from 'node:crypto';
import type { BucketOptions } from '../protocol/storage';
import type { Bucket, Head } from './bucket';
import { checkKey } from './bucket';

const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string): Buffer => createHmac('sha256', key).update(data, 'utf8').digest();
const hex = (key: Buffer, data: string): string => createHmac('sha256', key).update(data, 'utf8').digest('hex');

/** RFC 3986 — 안 감추는 것은 A-Z a-z 0-9 - _ . ~ 뿐. */
export const encode = (s: string): string => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export interface SignInput {
  readonly method: string;
  /** 감춘 경로 — `/bucket/a%20b`. */
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  /** 서명할 머리 — 이름은 소문자. host · x-amz-date · x-amz-content-sha256 이 든다. */
  readonly headers: Readonly<Record<string, string>>;
  readonly payloadHash: string;
  readonly region: string;
  readonly accessKey: string;
  readonly secretKey: string;
  /** `YYYYMMDDTHHMMSSZ` */
  readonly amzDate: string;
}

/** Authorization 머리의 값 — AWS4-HMAC-SHA256. */
export function signV4(i: SignInput): string {
  const day = i.amzDate.slice(0, 8);
  const scope = `${day}/${i.region}/s3/aws4_request`;
  const names = Object.keys(i.headers).map((h) => h.toLowerCase()).sort();
  const value = (n: string): string => (Object.entries(i.headers).find(([k]) => k.toLowerCase() === n)?.[1] ?? '').trim().replace(/\s+/g, ' ');
  const query = Object.keys(i.query)
    .sort()
    .map((k) => `${encode(k)}=${encode(i.query[k]!)}`)
    .join('&');
  const canonical = [i.method, i.path, query, names.map((n) => `${n}:${value(n)}\n`).join(''), names.join(';'), i.payloadHash].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', i.amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${i.secretKey}`, day), i.region), 's3'), 'aws4_request');
  const signature = hex(key, toSign);
  return `AWS4-HMAC-SHA256 Credential=${i.accessKey}/${scope},SignedHeaders=${names.join(';')},Signature=${signature}`;
}

/** SNAPSHOT_URI `s3://<bucket>/<prefix>` → bucket · prefix. 모양이 아니면 던진다. */
export function parseSnapshotUri(uri: string): { bucket: string; prefix: string } {
  const m = /^s3:\/\/([^/]+)\/?(.*)$/.exec(uri.trim());
  if (m === null) throw new Error(`SNAPSHOT_URI 는 s3://<bucket>/<prefix> — ${uri}`);
  return { bucket: m[1]!, prefix: m[2]!.replace(/\/+$/, '') };
}

const unxml = (s: string): string => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const META = 'x-amz-meta-';

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: Uint8Array }) => Promise<Response>;

export class S3Bucket implements Bucket {
  readonly where: string;

  constructor(
    private readonly o: BucketOptions,
    private readonly send: Fetch = (url, init) => fetch(url, init as RequestInit),
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.where = `s3://${o.bucket}/${o.prefix}`;
  }

  /** 물건의 이름 → bucket 안의 이름(prefix 를 붙인다). */
  private full(key: string): string {
    return this.o.prefix === '' ? checkKey(key) : `${this.o.prefix}/${checkKey(key)}`;
  }

  private pathOf(full: string | null): string {
    const base = `/${encode(this.o.bucket)}`;
    return full === null ? base : `${base}/${full.split('/').map(encode).join('/')}`;
  }

  private async call(method: string, full: string | null, extra: { query?: Record<string, string>; headers?: Record<string, string>; body?: Buffer } = {}): Promise<Response> {
    const endpoint = new URL(this.o.endpoint);
    const path = this.pathOf(full);
    const query = extra.query ?? {};
    const body = extra.body;
    const payloadHash = sha256(body ?? '');
    const amzDate = this.clock().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const headers: Record<string, string> = {
      host: endpoint.host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      ...(this.o.sessionToken === null ? {} : { 'x-amz-security-token': this.o.sessionToken }),
      ...(extra.headers ?? {}),
    };
    headers['authorization'] = signV4({ method, path, query, headers, payloadHash, region: this.o.region, accessKey: this.o.accessKey, secretKey: this.o.secretKey, amzDate });
    const search = Object.keys(query)
      .sort()
      .map((k) => `${encode(k)}=${encode(query[k]!)}`)
      .join('&');
    const url = `${endpoint.origin}${path}${search === '' ? '' : `?${search}`}`;
    const { host: _host, ...sent } = headers; // host 는 fetch 가 url 에서 — 서명한 것과 같다
    return this.send(url, { method, headers: sent, ...(body === undefined ? {} : { body: new Uint8Array(body) }) });
  }

  private async fail(res: Response, what: string): Promise<never> {
    const text = await res.text().catch(() => '');
    const code = /<Code>([^<]*)<\/Code>/.exec(text)?.[1] ?? '';
    throw new Error(`object storage ${what} — ${res.status}${code === '' ? '' : ` ${code}`}`);
  }

  async head(key: string): Promise<Head | null> {
    const res = await this.call('HEAD', this.full(key));
    if (res.status === 404) return null;
    if (!res.ok) return this.fail(res, `HEAD ${key}`);
    const meta: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      if (k.toLowerCase().startsWith(META)) meta[k.toLowerCase().slice(META.length)] = v;
    });
    return { etag: (res.headers.get('etag') ?? '').replace(/^"|"$/g, ''), meta };
  }

  async get(key: string): Promise<Buffer | null> {
    const res = await this.call('GET', this.full(key));
    if (res.status === 404) return null;
    if (!res.ok) return this.fail(res, `GET ${key}`);
    return Buffer.from(await res.arrayBuffer());
  }

  private metaHeaders(meta: Readonly<Record<string, string>>): Record<string, string> {
    return Object.fromEntries(Object.entries(meta).map(([k, v]) => [`${META}${k.toLowerCase()}`, v]));
  }

  async put(key: string, body: Buffer, meta: Readonly<Record<string, string>>, when?: string | null): Promise<boolean> {
    const cond: Record<string, string> = when === undefined ? {} : when === null ? { 'if-none-match': '*' } : { 'if-match': `"${when}"` };
    const res = await this.call('PUT', this.full(key), { body, headers: { 'content-type': 'application/octet-stream', ...this.metaHeaders(meta), ...cond } });
    if (res.status === 412 || res.status === 409) return false; // 조건이 틀렸다 · 같은 이름에 동시에
    if (!res.ok) return this.fail(res, `PUT ${key}`);
    await res.arrayBuffer();
    return true;
  }

  async copy(from: string, to: string, meta: Readonly<Record<string, string>>): Promise<void> {
    const source = this.pathOf(this.full(from));
    const res = await this.call('PUT', this.full(to), { headers: { 'x-amz-copy-source': source, 'x-amz-metadata-directive': 'REPLACE', ...this.metaHeaders(meta) } });
    if (res.status === 404) throw new Error(`물건이 없다 — ${from}`);
    if (!res.ok) return this.fail(res, `COPY ${from} → ${to}`);
    const text = await res.text();
    if (text.includes('<Error>')) throw new Error(`object storage COPY ${from} → ${to} — ${/<Code>([^<]*)<\/Code>/.exec(text)?.[1] ?? '실패'}`); // 200 안의 실패
  }

  async list(prefix: string): Promise<string[]> {
    const head = this.o.prefix === '' ? '' : `${this.o.prefix}/`;
    const out: string[] = [];
    let token: string | null = null;
    do {
      const query: Record<string, string> = { 'list-type': '2', prefix: `${head}${prefix}` };
      if (token !== null) query['continuation-token'] = token;
      const res = await this.call('GET', null, { query });
      if (!res.ok) return this.fail(res, `LIST ${prefix}`);
      const text = await res.text();
      for (const m of text.matchAll(/<Key>([^<]*)<\/Key>/g)) out.push(unxml(m[1]!).slice(head.length));
      token = /<IsTruncated>true<\/IsTruncated>/.test(text) ? unxml(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(text)?.[1] ?? '') || null : null;
    } while (token !== null);
    return out.sort();
  }

  async remove(key: string): Promise<void> {
    const res = await this.call('DELETE', this.full(key));
    if (!res.ok && res.status !== 404) return this.fail(res, `DELETE ${key}`);
    await res.arrayBuffer();
  }
}
