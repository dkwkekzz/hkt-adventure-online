// RateLimiter.admit · Acceptor.accept · Connection.open · Connection.relay · Connection.close · Keepalive.ping · GateReporter.report
// (흐름 1 의 4 · 5 · 5 의 5 · 6 · 7 의 7 · 8 · 9 의 1 · 2 · 10 · 11 · 11 의 1) — 가짜 호스트(ws 서버) 위에서.

import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { WebSocketServer } from 'ws';
import type { TraceInput } from '../../protocol/observe';
import type { GatewayConfig, GatewaySocket } from '../../protocol/gateway';
import type { Attached, GateReport, Unattached } from '../../protocol/session';
import { openGateway } from '..';
import { Keepalive } from '../keepalive';
import { RateLimiter } from '../rate-limiter';
import type { Connection } from '../connection';

const CONFIG: GatewayConfig = { port: 0, helloMs: 300, rerouteMs: 200, pongMs: 100, maxBytes: 1024, maxRate: 1000, ipLimit: 10 };

/** 가짜 호스트 — 첫 글의 자격을 적고 `Link 1` 을 연다. 받은 Link 3 은 Link 2 로 되돌린다. */
async function fakeHost(): Promise<{ url: string; credentials: unknown[]; got: unknown[]; sockets: WebSocket[]; close: () => Promise<void> }> {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((r) => wss.once('listening', () => r()));
  const credentials: unknown[] = [];
  const got: unknown[] = [];
  const sockets: WebSocket[] = [];
  wss.on('connection', (ws) => {
    sockets.push(ws);
    ws.once('message', (data) => {
      const hello = JSON.parse(data.toString()) as { credential: unknown };
      credentials.push(hello.credential);
      if (hello.credential === 'refuse-me') {
        ws.send(JSON.stringify({ step: 'Link 1', reject: { why: '거절' } }));
        return ws.close(4002);
      }
      ws.send(JSON.stringify({ step: 'Link 1', open: { bodies: [7] } }));
      ws.on('message', (m) => {
        const msg = JSON.parse(m.toString()) as { step: string; input?: unknown };
        got.push(msg);
        ws.send(JSON.stringify({ step: 'Link 2', body: 7, delta: msg.input ?? null }));
      });
    });
  });
  const at = wss.address() as { port: number };
  return { url: `ws://localhost:${at.port}`, credentials, got, sockets, close: () => new Promise((r) => wss.close(() => r())) };
}

let opened: { gate: GatewaySocket; host: Awaited<ReturnType<typeof fakeHost>> }[] = [];
afterEach(async () => {
  for (const o of opened) {
    await o.gate.close('end');
    await o.host.close();
  }
  opened = [];
});

async function up(over: Partial<GatewayConfig> = {}, attach?: (c: string) => Attached | Unattached) {
  const host = await fakeHost();
  const traces: TraceInput[] = [];
  const reports: GateReport[] = [];
  const detached: string[] = [];
  const gate = openGateway({
    config: { ...CONFIG, ...over },
    name: 'gate-1',
    address: '',
    clockMs: 60_000,
    verify: (t) => (typeof t === 'string' && t.startsWith('ok-') ? t.slice(3) : null),
    attach: async (c) => (attach ? attach(c) : { instance: 'main', address: host.url, token: `host-${c}` }),
    detach: (c) => void detached.push(c),
    report: (r) => void reports.push(r),
    trace: (t) => void traces.push(t),
    log: () => {},
  });
  await gate.listen('boot');
  opened.push({ gate, host });
  return { gate, host, traces, reports, detached, url: `ws://localhost:${gate.port}` };
}

/** 클라이언트 하나 — 받은 글과 닫힘 코드를 모은다. */
function client(url: string, hello?: unknown): Promise<{ ws: WebSocket; msgs: { step: string; [k: string]: unknown }[]; closed: Promise<number> }> {
  return new Promise((ok, fail) => {
    const ws = new WebSocket(url);
    const msgs: { step: string }[] = [];
    const closed = new Promise<number>((r) => ws.on('close', (code) => r(code)));
    ws.on('message', (m) => msgs.push(JSON.parse(m.toString()) as { step: string }));
    ws.on('unexpected-response', (req, res) => {
      req.destroy();
      fail(new Error(`http ${res.statusCode}`));
    });
    ws.on('error', () => {});
    ws.on('open', () => {
      if (hello !== undefined) ws.send(typeof hello === 'string' ? hello : JSON.stringify(hello));
      ok({ ws, msgs: msgs as { step: string; [k: string]: unknown }[], closed });
    });
  });
}

const until = async (cond: () => boolean, ms = 3000): Promise<void> => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('기다리다 지쳤다');
    await new Promise((r) => setTimeout(r, 10));
  }
};
const steps = (traces: TraceInput[]) => traces.map((t) => `${t.flow}.${t.step}.${t.end}`);

describe('Acceptor.accept · Connection.open · Connection.relay — 흐름 9', () => {
  it('첫 글의 자격만 attach 가 준 토큰으로 바꾸고, 나머지 글은 그대로 넘긴다. 클라이언트가 닫으면 호스트 쪽도 닫고 detach', async () => {
    const { host, traces, detached, url } = await up();
    const c = await client(url, { step: 'Host 2', credential: 'ok-p1' });
    await until(() => c.msgs.length >= 1);
    expect(c.msgs[0]).toEqual({ step: 'Link 1', open: { bodies: [7] } });
    expect(host.credentials).toEqual(['host-p1']); // 클라이언트의 토큰은 게이트웨이까지만
    c.ws.send(JSON.stringify({ step: 'Link 3', input: { body: 7, actionId: 'a' } }));
    await until(() => c.msgs.length >= 2);
    expect(host.got).toEqual([{ step: 'Link 3', input: { body: 7, actionId: 'a' } }]);
    expect(c.msgs[1]).toEqual({ step: 'Link 2', body: 7, delta: { body: 7, actionId: 'a' } });
    expect(steps(traces).filter((s) => s.startsWith('9.'))).toEqual(['9.1.ok', '9.2.ok', '9.10.ok', '9.11.wait']);
    expect(traces.find((t) => t.flow === 9 && t.step === 10)).toMatchObject({ unit: 'main', account: 'p1' });
    c.ws.close(1000);
    await until(() => detached.length === 1);
    expect(detached).toEqual(['p1']);
    expect(traces.find((t) => t.flow === 11 && t.step === 1)).toMatchObject({ end: 'ok', account: 'p1', counts: { code: 1000 } });
    await until(() => host.sockets[0]!.readyState === WebSocket.CLOSED);
  });

  it('거절 — 글이 아니거나 Host 2 가 아니면 4001, 첫 글이 한계 안에 없으면 4001, 토큰이 틀리면 Link 1 거절 뒤 4002. 이어지지 않았으면 detach 도 없다', async () => {
    const { traces, detached, url } = await up();
    expect(await (await client(url, 'not json')).closed).toBe(4001);
    expect(await (await client(url, { step: 'Link 3' })).closed).toBe(4001);
    expect(await (await client(url)).closed).toBe(4001); // helloMs
    const bad = await client(url, { step: 'Host 2', credential: 'nope' });
    expect(await bad.closed).toBe(4002);
    expect(bad.msgs).toEqual([{ step: 'Link 1', reject: { why: '토큰이 틀렸거나 만료되었다 — 다시 입장' } }]);
    expect(detached).toEqual([]);
    expect(steps(traces).filter((s) => /^9\.2\./.test(s))).toEqual(['9.2.refused', '9.2.refused', '9.2.refused', '9.2.refused']);
  });

  it('세션이 없으면(attach 의 까닭) Link 1 거절 뒤 4002', async () => {
    const { url, detached } = await up({}, () => ({ why: '세션이 없다 — 먼저 입장' }));
    const c = await client(url, { step: 'Host 2', credential: 'ok-p1' });
    expect(await c.closed).toBe(4002);
    expect(c.msgs).toEqual([{ step: 'Link 1', reject: { why: '세션이 없다 — 먼저 입장' } }]);
    expect(detached).toEqual([]);
  });

  it('같은 캐릭터가 다시 붙으면 옛 접속을 4000 으로 닫는다 — 나중 접속이 이긴다', async () => {
    const { url, detached } = await up();
    const a = await client(url, { step: 'Host 2', credential: 'ok-p1' });
    await until(() => a.msgs.length >= 1);
    const b = await client(url, { step: 'Host 2', credential: 'ok-p1' });
    expect(await a.closed).toBe(4000);
    await until(() => b.msgs.length >= 1);
    expect(b.msgs[0]).toMatchObject({ step: 'Link 1', open: {} });
    expect(detached).toEqual(['p1']);
  });

  it('호스트가 엔진의 코드(4002)로 닫으면 그대로, 그 밖으로 닫히면 rerouteMs 를 기다려 1001', async () => {
    const refused = await up({}, (c) => ({ instance: 'main', address: opened.at(-1)!.host.url, token: c === 'p1' ? 'refuse-me' : 'x' }));
    const a = await client(refused.url, { step: 'Host 2', credential: 'ok-p1' });
    expect(await a.closed).toBe(4002);
    expect(a.msgs).toEqual([{ step: 'Link 1', reject: { why: '거절' } }]); // 호스트의 거절이 그대로 온다

    const { host, url } = await up();
    const b = await client(url, { step: 'Host 2', credential: 'ok-p2' });
    await until(() => b.msgs.length >= 1);
    const t0 = Date.now();
    host.sockets.at(-1)!.close(1001); // 세계가 내려갔다
    expect(await b.closed).toBe(1001);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(150); // rerouting — 다른 호스트로 잇기를 기다렸다
  });
});

describe('RateLimiter.admit · check — 흐름 9 의 1 · 11', () => {
  it('한 주소의 열린 접속이 한계면 소켓을 받지 않는다(429). 닫히면 다시 받는다', async () => {
    const { url, traces } = await up({ ipLimit: 2 });
    const a = await client(url, { step: 'Host 2', credential: 'ok-p1' });
    await client(url, { step: 'Host 2', credential: 'ok-p2' });
    await expect(client(url, { step: 'Host 2', credential: 'ok-p3' })).rejects.toThrow(/http 429/);
    expect(steps(traces).filter((s) => /^9\.1\./.test(s))).toEqual(['9.1.ok', '9.1.ok', '9.1.refused']);
    a.ws.close();
    await a.closed;
    await until(() => false, 100).catch(() => {});
    await expect(client(url, { step: 'Host 2', credential: 'ok-p3' })).resolves.toBeTruthy();
  });

  it('크기 · 빈도를 넘는 글은 버리고 센다 — 접속은 닫지 않는다', async () => {
    const r = new RateLimiter({ maxBytes: 10, maxRate: 2, ipLimit: 1 });
    const meter = { start: 0, n: 0 };
    expect([r.check(5, meter), r.check(11, meter), r.check(5, meter)]).toEqual([true, false, false]);
    expect(r.dropped).toBe(2);
    const { host, url } = await up({ maxBytes: 64 });
    const c = await client(url, { step: 'Host 2', credential: 'ok-p1' });
    await until(() => c.msgs.length >= 1);
    c.ws.send(JSON.stringify({ step: 'Link 3', input: 'x'.repeat(100) })); // 버린다
    c.ws.send(JSON.stringify({ step: 'Link 3', input: 'y' }));
    await until(() => host.got.length >= 1);
    expect(host.got).toEqual([{ step: 'Link 3', input: 'y' }]);
    expect(c.ws.readyState).toBe(WebSocket.OPEN);
  });
});

describe('Keepalive.ping — 흐름 5 의 5', () => {
  it('ping 을 보내고, 답 없이 pongMs 가 지나면 닫게 한다(1001). 답이 오면 다시 보낸다', () => {
    let now = 0;
    const k = new Keepalive(100, () => now);
    const closed: number[] = [];
    let pings = 0;
    const conn = { pingAt: null as number | null, ping: () => void pings++, close: (code: number) => void closed.push(code) } as unknown as Connection;
    expect(k.ping(conn)).toBe(true);
    expect(pings).toBe(1);
    now = 50;
    expect(k.ping(conn)).toBe(true); // 기다리는 중 — 다시 보내지 않는다
    expect(pings).toBe(1);
    conn.pingAt = null; // pong
    now = 120;
    expect(k.ping(conn)).toBe(true);
    expect(pings).toBe(2);
    now = 230;
    expect(k.ping(conn)).toBe(false);
    expect(closed).toEqual([1001]);
  });
});

describe('GateReporter.report · 흐름 1 의 4 · 5 · 7 의 7 · 8', () => {
  it('listen 이 듣고 알린다. close 는 closing 을 알리고 접속을 전부 1001 로 닫는다', async () => {
    const { gate, traces, reports, url } = await up();
    expect(steps(traces).slice(0, 2)).toEqual(['1.4.wait', '1.5.ok']);
    expect(reports[0]).toEqual({ name: 'gate-1', address: `ws://localhost:${gate.port}`, closing: false, connections: [] });
    const c = await client(url, { step: 'Host 2', credential: 'ok-p1' });
    await until(() => c.msgs.length >= 1);
    await gate.close('stop');
    expect(await c.closed).toBe(1001);
    expect(reports.at(-1)).toEqual({ name: 'gate-1', address: `ws://localhost:${gate.port}`, closing: true, connections: [{ character: 'p1', instance: 'main' }] });
    expect(steps(traces).filter((s) => s.startsWith('7.'))).toEqual(['7.7.ok', '7.8.ok']);
    expect(traces.find((t) => t.flow === 7 && t.step === 8)).toMatchObject({ counts: { connections: 1 } });
    opened = opened.filter((o) => o.gate !== gate);
  });
});
