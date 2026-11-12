// Monitor — 프로세스의 관측 (design/README.md 의 Monitor, 흐름 14). 내부 주소의 http 하나 — /health · /metrics · /observe · /observe/page.
// 개념을 부르지 않는다. 수치는 흔적이 고친 단위의 표(units)와 단계마다의 셈(tally)이다 — 그 프로세스가 이미 든 것.
// trace 는 기다리지 않고 실패하지 않는다. 느린 읽는 이의 몫은 버리고 버린 수를 다음 글에 싣는다.

import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server, ServerResponse } from 'node:http';
import type { FlowMap, Metrics, StreamHead, Trace, TraceInput, UnitNow } from '../../protocol/observe';
import { monitorPage } from './monitor-page';

/** 읽는 이 하나의 쓰기 버퍼가 이만큼 차면 그 몫을 버린다. */
const BACKLOG = 256 * 1024;

interface Reader {
  readonly res: ServerResponse;
  dropped: number;
}

export interface MonitorParts {
  readonly role: string;
  readonly build: string;
  readonly map: FlowMap;
  /** recent 의 상한 */
  readonly traceKeep: number;
  /** 수치를 흘리는 간격(ms) — Clock 의 간격 */
  readonly every: number;
  /** 서명 키 — 계정을 가명으로. 프로세스마다 같은 키라 가명도 같다 */
  readonly key: string;
}

/** 가명 — HMAC(키, "observe:" + 계정) 의 앞 8 자. 키 없이는 계정으로 되돌릴 수 없다. */
export const aliasOf = (key: string, account: string): string => createHmac('sha256', key).update(`observe:${account}`).digest('hex').slice(0, 8);

export class Monitor {
  // 데이터 — role · build · map · key(불변) · server · recent · readers · units · tally · closing
  readonly role: string;
  readonly build: string;
  readonly map: FlowMap;
  readonly server: Server;
  readonly recent: Trace[] = [];
  readonly readers = new Set<Reader>();
  readonly units = new Map<string, UnitNow>();
  readonly tally = new Map<string, number>();
  closing = false;
  port = 0;
  private readonly keep: number;
  private readonly every: number;
  private timer: NodeJS.Timeout | null = null;
  private readonly html: string;
  private readonly key: string;

  constructor(parts: MonitorParts) {
    this.role = parts.role;
    this.build = parts.build;
    this.map = parts.map;
    this.keep = parts.traceKeep;
    this.every = parts.every;
    this.key = parts.key;
    this.html = monitorPage(parts.map);
    this.server = createServer((req, res) => {
      const path = new URL(req.url ?? '/', 'http://x').pathname;
      if (req.method !== 'GET') return void res.writeHead(405).end();
      if (path === '/health') {
        const { code, text } = this.health();
        res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        return void res.end(text);
      }
      if (path === '/metrics') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        return void res.end(JSON.stringify(this.metrics()));
      }
      if (path === '/observe/page') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
        return void res.end(this.page());
      }
      if (path === '/observe') return this.stream(res);
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('없다');
    });
    this.trace = this.trace.bind(this);
  }

  /** health — 흐름 14 의 1. 듣고 있으면 200, 내려가는 가운데면 503. */
  health(): { code: number; text: string } {
    return this.closing ? { code: 503, text: 'closing' } : { code: 200, text: 'ok' };
  }

  /** metrics — 흐름 14 의 2 · 4. */
  metrics(): Metrics {
    return {
      role: this.role,
      build: this.build,
      closing: this.closing,
      at: Date.now(),
      units: [...this.units.values()],
      tally: Object.fromEntries(this.tally),
    };
  }

  /** page — 흐름 14 의 3. 흐름의 지도를 품은 페이지 한 장. */
  page(): string {
    return this.html;
  }

  /** stream — 흐름 14 의 4 · 5. 수치 하나와 recent 를 보낸 뒤 흔적과 간격마다의 수치를 흘린다. */
  stream(res: ServerResponse): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'access-control-allow-origin': '*', // 관측 페이지가 ?from= 으로 다른 프로세스의 Monitor 를 함께 읽는다
    });
    const reader: Reader = { res, dropped: 0 };
    const head: StreamHead = { metrics: this.metrics(), recent: this.recent };
    res.write(`retry: 2000\nevent: metrics\ndata: ${JSON.stringify(head)}\n\n`);
    this.readers.add(reader);
    res.on('close', () => this.readers.delete(reader));
  }

  /** trace — 넘겨받은 계정을 가명으로 바꾸고, 흔적 하나를 recent · units · tally 와 readers 마다에. 기다리지 않는다. */
  trace(t: TraceInput): void {
    try {
      const { account, ...rest } = t;
      const trace: Trace = { at: Date.now(), ...rest, ...(account === undefined ? {} : { who: aliasOf(this.key, account) }) };
      this.recent.push(trace);
      if (this.recent.length > this.keep) this.recent.splice(0, this.recent.length - this.keep);
      const key = `${trace.flow}.${trace.step}.${trace.end}`;
      this.tally.set(key, (this.tally.get(key) ?? 0) + 1);
      if (trace.unit !== '-' && (trace.state !== undefined || trace.counts !== undefined)) {
        const was = this.units.get(trace.unit);
        this.units.set(trace.unit, {
          unit: trace.unit,
          state: trace.state ?? was?.state ?? null,
          counts: { ...was?.counts, ...trace.counts },
          at: trace.at,
        });
      }
      this.send('trace', trace);
    } catch {
      // 흔적은 단계의 결과를 바꾸지 않는다
    }
  }

  private send(event: string, value: unknown): void {
    for (const r of this.readers) {
      if (r.res.writableLength > BACKLOG) {
        r.dropped++;
        continue;
      }
      const data = r.dropped > 0 && event === 'metrics' ? { ...(value as object), dropped: r.dropped } : value;
      if (event === 'metrics') r.dropped = 0;
      r.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  }

  /** listen — 내부 주소의 http 를 연다. 간격마다 수치를 흘린다. */
  async listen(port: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, () => resolve());
    });
    const at = this.server.address();
    this.port = typeof at === 'object' && at !== null ? at.port : port;
    this.timer = setInterval(() => this.send('metrics', this.metrics()), this.every);
    this.timer.unref();
  }

  /** close — stream 을 닫고 http 를 닫는다. 프로세스가 내려가는 끝(흐름 7). */
  async close(): Promise<void> {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    for (const r of this.readers) r.res.end();
    this.readers.clear();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
    this.server.closeAllConnections();
  }
}
