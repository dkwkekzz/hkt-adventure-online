// Service.start · Api login · enter · Service.stop (흐름 1 · 2 · 3 · 7)과 그 흔적(흐름 14) — 가짜 엔진 위에서, http 로.

import { cpSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeEngine, portRange, until } from '../../../fleet/tests/fake';
import { loadConfig } from '../config';
import type { ServiceConfig } from '../config';
import { Service } from '../service';

let services: Service[] = [];
afterEach(async () => {
  await Promise.all(services.map((s) => s.stop()));
  services = [];
});

/** 포트 다섯 — 넷은 호스트, 마지막은 게이트웨이. */
function config(storageRoot = mkdtempSync(join(tmpdir(), 'svc-')), range = portRange()): ServiceConfig {
  const ports: [number, number] = [range[0], range[1] - 1];
  const gatePort = range[1];
  return {
    gateway: { port: gatePort, helloMs: 2000, rerouteMs: 500, pongMs: 5000, maxBytes: 65536, maxRate: 100, ipLimit: 32 },
    storage: { root: storageRoot, mongodbUri: null, bucket: null, leaseMs: 1000, characterHistory: 2 },
    apiPort: 0,
    monitorPort: 0,
    traceKeep: 200,
    build: 'test',
    tokenTtl: 3600,
    agentTtl: 60,
    keymap: 'dataset/keymap.json',
    fleet: {
      engineDir: fakeEngine(),
      world: 'main',
      dataset: 'dataset/world.json',
      party: 'lead-1',
      capacity: 8,
      viewerOut: join(storageRoot, 'viewer', 'viewer.js'),
      pageUrl: 'http://play.test/play',
      beat: 200,
      sparse: 10,
      npc: { account: 'npc', bodies: ['b1'] },
      ports,
      gateUrl: `ws://localhost:${gatePort}`,
      hostName: 'localhost',
      clockMs: 60_000,
      idleLimit: 3,
      startLimitMs: 5000,
      stopLimitMs: 2000,
      commandLimitMs: 1000,
      restartLimit: 2,
      backupEvery: 0,
    },
  };
}

async function up(c: ServiceConfig = config()) {
  const s = await Service.start(c, 'k', () => {});
  services.push(s);
  const base = `http://localhost:${s.port}`;
  const post = async (path: string, body: unknown) => {
    const r = await fetch(base + path, { method: 'POST', body: JSON.stringify(body) });
    return { code: r.status, body: (await r.json()) as Record<string, string> };
  };
  return { s, base, post };
}

describe('Service — 흐름 1 · 2 · 3 · 7', () => {
  it('키가 없으면 시작 거부', async () => {
    await expect(Service.start(config(), '')).rejects.toThrow(/HOST_AUTH_KEY/);
  });

  it('GET / 는 게스트 페이지. /health 는 Api 에 없고 Monitor 의 내부 주소에', async () => {
    const { s, base } = await up();
    expect(await (await fetch(base + '/')).text()).toContain('/login');
    expect((await fetch(base + '/health')).status).toBe(404);
    expect(await (await fetch(`http://localhost:${s.monitor.port}/health`)).text()).toBe('ok');
    expect((await fetch(base + '/nope')).status).toBe(404);
  });

  it('Static — /play 는 엔진의 뷰어 페이지, /viewer.js 는 시작 때 묶은 것, /assets/ · ext/ · /keymap.json. 뿌리 밖은 없다', async () => {
    const { base } = await up();
    const get = async (p: string) => {
      const r = await fetch(base + p);
      return { code: r.status, type: r.headers.get('content-type'), text: await r.text() };
    };
    expect(await get('/play?token=x&ws=y')).toMatchObject({ code: 200, text: expect.stringContaining('viewer.js') });
    expect(await get('/viewer.js')).toMatchObject({ code: 200, type: 'text/javascript; charset=utf-8', text: expect.stringContaining('fake viewer') });
    expect((await get('/viewer.js.map')).code).toBe(200);
    expect(await get('/assets/index.json')).toMatchObject({ code: 200, type: 'application/json; charset=utf-8', text: '{"x":1}\n' });
    expect(await get('/assets/images/a.png')).toMatchObject({ code: 200, type: 'image/png' });
    expect(await get('/assets/ext/fairy/b.glb')).toMatchObject({ code: 200, type: 'model/gltf-binary', text: 'glb' });
    expect(await get('/keymap.json')).toMatchObject({ code: 200, text: '{"keys":{}}\n' });
    expect((await get('/assets/%2e%2e/apps/viewer/page.html')).code).toBe(404);
    expect((await get('/assets/ext/%2e%2e/%2e%2e/web/assets/index.json')).code).toBe(404);
    expect((await get('/assets/images')).code).toBe(404); // 폴더
  });

  it('login → enter — 같은 주체는 같은 계정, 다른 주체는 다른 계정 · 같은 세계. 틀린 토큰 · 제공자는 거절', async () => {
    const { s, post } = await up();
    const a = await post('/login', { provider: 'guest' });
    expect(a.code).toBe(200);
    expect(a.body['token']).toMatch(/^hkt1\.p[0-9a-f]{12}\.\d+\./);
    const a2 = await post('/login', { provider: 'guest', subject: a.body['subject'] });
    expect(a2.body['token']!.split('.')[1]).toBe(a.body['token']!.split('.')[1]);
    const b = await post('/login', { provider: 'guest' });

    const ea = await post('/enter', { token: a.body['token'] });
    expect(ea.code).toBe(200);
    expect(ea.body['gate']).toBe(`ws://localhost:${s.config.gateway.port}`); // 게이트웨이 하나 — 호스트의 주소는 가지 않는다
    expect(ea.body['page']).toBe(`http://play.test/play?token=${encodeURIComponent(a.body['token']!)}&ws=${encodeURIComponent(ea.body['gate']!)}`);
    const eb = await post('/enter', { token: b.body['token'] });
    expect(eb.body['gate']).toBe(ea.body['gate']);
    expect(s.fleet.shards.size).toBe(1);

    const t = a.body['token']!;
    const at = t.lastIndexOf('.') + 1;
    const bad = `${t.slice(0, at)}${t[at] === 'A' ? 'B' : 'A'}${t.slice(at + 1)}`; // 서명의 첫 글자를 바꾼다
    expect((await post('/enter', { token: bad })).code).toBe(400);
    expect((await post('/login', { provider: 'oauth' })).code).toBe(400);
    expect((await post('/login', { provider: 'guest', subject: 'a b' })).code).toBe(400);
  });

  it('stop 뒤 다시 start — 사용자 표 · 배정 표가 스토리지에서 되돌아온다', async () => {
    const c = config();
    const first = await up(c);
    const a = await first.post('/login', { provider: 'guest' });
    await first.post('/enter', { token: a.body['token'] });
    await new Promise((r) => setTimeout(r, 100)); // 세계가 몇 박자 돈다 — now > 0 이어야 이어간다
    await first.s.stop();
    await first.s.stop(); // 두 번 불려도 한 번
    const second = await up(c);
    expect(second.s.fleet.shardOf('main')?.state).toBe('stopped');
    const again = await second.post('/login', { provider: 'guest', subject: a.body['subject'] });
    expect(again.body['token']!.split('.')[1]).toBe(a.body['token']!.split('.')[1]);
    expect((await second.post('/enter', { token: again.body['token'] })).code).toBe(200);
    expect(second.s.fleet.shardOf('main')?.resumed).toBe(true);
  });

  it('다른 서버에서 같은 스토리지로 — 이 서버의 자리(local) 없이 표(db)와 Store(bucket)만으로 계정 · 배정 · 세계가 그대로', async () => {
    const c = config();
    const first = await up(c);
    const a = await first.post('/login', { provider: 'guest' });
    await first.post('/enter', { token: a.body['token'] });
    const port = first.s.fleet.shardOf('main')!.row.port;
    await new Promise((r) => setTimeout(r, 100));
    await first.s.stop(); // 흐름 7 의 5 — 내려간 Store 를 올렸다
    expect(first.s.monitor.recent.find((t) => t.flow === 7 && t.step === 5)).toMatchObject({ end: 'ok', unit: 'main' });
    // 다른 서버 — 같은 MongoDB(db/) · 같은 object storage(bucket/), 빈 local
    const other = mkdtempSync(join(tmpdir(), 'svc-other-'));
    cpSync(join(c.storage.root, 'db'), join(other, 'db'), { recursive: true });
    cpSync(join(c.storage.root, 'bucket'), join(other, 'bucket'), { recursive: true });
    const second = await up({ ...c, storage: { ...c.storage, root: other }, fleet: { ...c.fleet, viewerOut: join(other, 'viewer', 'viewer.js') } });
    expect(existsSync(join(other, 'local'))).toBe(false);
    const again = await second.post('/login', { provider: 'guest', subject: a.body['subject'] });
    expect(again.body['token']!.split('.')[1]).toBe(a.body['token']!.split('.')[1]); // 같은 계정
    const entered = await second.post('/enter', { token: again.body['token'] });
    expect(entered.code).toBe(200);
    expect(second.s.fleet.shardOf('main')?.row.port).toBe(port); // 같은 배정(포트)
    expect(second.s.fleet.shardOf('main')?.resumed).toBe(true); // 올라간 Store 를 내려 받아 이어간다
    expect(second.s.fleet.shardOf('main')?.row.epoch).toBe(2); // 세대가 이어진다
  });

  it('게이트웨이 — 받은 주소 하나로 붙어 호스트와 이어진다. 입장 없이 붙으면 4002. 사람은 9 의 8 에서 active, 닫으면 11 의 2 에서 grace', async () => {
    const { s, post } = await up();
    const a = await post('/login', { provider: 'guest' });
    const b = await post('/login', { provider: 'guest' });
    const gate = (await post('/enter', { token: a.body['token'] })).body['gate']!;
    const link = (token: string) =>
      new Promise<{ first: Record<string, unknown>; code: Promise<number>; ws: WebSocket }>((ok) => {
        const ws = new WebSocket(gate);
        const code = new Promise<number>((r) => ws.addEventListener('close', (e) => r(e.code)));
        ws.addEventListener('open', () => ws.send(JSON.stringify({ step: 'Host 2', credential: token })));
        ws.addEventListener('message', (m) => ok({ first: JSON.parse(String(m.data)) as Record<string, unknown>, code, ws }), { once: true });
      });
    const ok = await link(a.body['token']!);
    expect(ok.first).toMatchObject({ step: 'Link 1', open: { bodies: [1, 2] } });
    const none = await link(b.body['token']!); // 입장하지 않았다 — 세션이 없다
    expect(none.first).toEqual({ step: 'Link 1', reject: { why: '세션이 없다 — 먼저 입장' } });
    expect(await none.code).toBe(4002);
    ok.ws.close(1000);
    expect(await ok.code).toBe(1000);
    await until(() => s.monitor.recent.some((t) => t.flow === 11 && t.step === 2));
    const who = s.monitor.recent.find((t) => t.flow === 2 && t.step === 5 && t.who !== undefined)!.who;
    expect(s.monitor.recent.filter((t) => t.person !== undefined && t.who === who).map((t) => `${t.flow}.${t.step} ${t.person}`)).toEqual(['2.5 login', '3.9 pending', '9.8 active', '11.2 grace']);
    const run = s.monitor.recent.find((t) => t.flow === 9 && t.step === 10)!.run;
    expect(s.monitor.recent.filter((t) => t.run === run).map((t) => `${t.flow}.${t.step}.${t.end}`)).toEqual(['9.1.ok', '9.2.ok', '9.3.ok', '9.8.ok', '9.9.ok', '9.10.ok', '9.11.wait', '11.1.ok', '11.2.wait']); // 접속 하나 = run 하나
  });

  it('Monitor.trace — 흐름 1 · 2 · 3 · 7 의 단계가 차례로 흔적을 남긴다. 한 입장은 run 하나로 Api · 함대를 잇는다', async () => {
    const { s, post } = await up();
    const steps = (flow: number, run?: string) => s.monitor.recent.filter((t) => t.flow === flow && (run === undefined || t.run === run)).map((t) => `${t.step}.${t.end}`);
    expect(steps(1)).toEqual(['7.ok', '1.ok', '2.ok', '4.wait', '5.ok', '3.wait']); // 4 · 5 — 게이트웨이가 듣고 알린다. 3(Api.listen)은 시작이 다 끝난 뒤에 남긴다
    const a = await post('/login', { provider: 'guest' });
    expect(steps(2)).toEqual(['1.ok', '2.ok', '4.ok', '5.wait']);
    await post('/enter', { token: a.body['token'] });
    const run = s.monitor.recent.find((t) => t.flow === 3)!.run;
    expect(steps(3, run)).toEqual(['1.ok', '2.ok', '14.ok', '11.ok', '13.ok', '15.ok', '16.ok', '17.ok', '18.ok', '19.ok', '8.ok', '9.wait']); // 8 — 게이트웨이를 고른다(하나)
    expect(s.monitor.units.get('main')).toMatchObject({ state: 'ready' });
    await post('/enter', { token: 'nope' });
    expect(s.monitor.tally.get('3.2.refused')).toBe(1);
    const account = a.body['token']!.split('.')[1]!;
    expect(s.monitor.recent.every((t) => !JSON.stringify(t).includes(a.body['token']!) && !JSON.stringify(t).includes(a.body['subject']!) && !JSON.stringify(t).includes(account))).toBe(true);
    // 사람은 가명으로 — 로그인과 입장이 같은 가명, 입장의 답은 세션을 싣는다
    const who = (flow: number, step: number) => s.monitor.recent.find((t) => t.flow === flow && t.step === step && t.who !== undefined)?.who;
    expect(who(2, 2)).toMatch(/^[0-9a-f]{8}$/);
    expect(who(3, 9)).toBe(who(2, 2));
    expect(s.monitor.recent.find((t) => t.flow === 3 && t.step === 9 && t.run === run)).toMatchObject({ session: run });
    expect(s.monitor.recent.find((t) => t.flow === 3 && t.step === 2 && t.end === 'refused')!.who).toBeUndefined(); // 틀린 토큰은 누군지 모른다
    // 사람의 state — 로그인의 답은 login, 입장의 답은 pending
    expect(s.monitor.recent.filter((t) => t.person !== undefined && t.who === who(2, 2)).map((t) => `${t.flow}.${t.step} ${t.person}`)).toEqual(['2.5 login', '3.9 pending']);
    const monitor = s.monitor;
    await s.stop();
    const stop = monitor.recent.filter((t) => t.flow === 7).map((t) => `${t.step}.${t.state ?? ''}`);
    expect(stop).toEqual(['7.', '8.', '4.stopping', '5.', '10.', '11.']); // 게이트웨이가 알리고 닫고 · 내리고 · Store 를 올리고 · Api 를 닫고 · 스토리지를 닫는다
    expect(monitor.units.get('main')?.state).toBe('stopped'); // 흐름 4 의 5 — 호스트가 끝났다
  });

  it('loadConfig — 상대 경로는 파일의 자리에서, env 가 몇 칸을 덮는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
    const file = join(dir, 'service.config.json');
    const c = config();
    const { pageUrl: _, gateUrl: _g, ...fleet } = c.fleet;
    const { storage: _s, ...rest } = c;
    writeFileSync(file, JSON.stringify({ ...rest, storageRoot: 'out/storage', leaseMs: 30000, characterHistory: 5, fleet: { ...fleet, publicHost: 'localhost', secure: false, engineDir: 'engine', viewerOut: 'out/viewer/viewer.js' } }));
    const read = loadConfig(file, { PORT: '9001', MONITOR_PORT: '9002', SERVICE_PUBLIC_HOST: 'play.test', SERVICE_SECURE: '1' });
    expect(read.storage).toEqual({ root: join(dir, 'out/storage'), mongodbUri: null, bucket: null, leaseMs: 30000, characterHistory: 5 });
    expect(read.fleet.engineDir).toBe(join(dir, 'engine'));
    expect(read.fleet.viewerOut).toBe(join(dir, 'out/viewer/viewer.js'));
    expect(read.apiPort).toBe(9001);
    expect(read.monitorPort).toBe(9002);
    expect(read.build).toBe('-'); // 곁에 engine.lock 이 없다
    expect(read.fleet.pageUrl).toBe('https://play.test:9001/play');
    expect(read.fleet.gateUrl).toBe(`wss://play.test:${c.gateway.port}`);
    expect(loadConfig(file, { GATE_PORT: '9003', SERVICE_GATE_URL: 'wss://play.test/gate' }).gateway.port).toBe(9003);
    expect(loadConfig(file, { SERVICE_GATE_URL: 'wss://play.test/gate' }).fleet.gateUrl).toBe('wss://play.test/gate');
    expect(loadConfig(file, { SERVICE_PAGE_URL: 'https://play.test/play' }).fleet.pageUrl).toBe('https://play.test/play');
    // 스토리지의 뒤는 환경변수 — 자격은 설정 파일에 없다
    const remote = loadConfig(file, { MONGODB_URI: 'mongodb://db:27017/hkt', SNAPSHOT_URI: 's3://snaps/hkt/', AWS_ACCESS_KEY_ID: 'id', AWS_SECRET_ACCESS_KEY: 'secret', AWS_REGION: 'ap-northeast-2' }).storage;
    expect(remote.mongodbUri).toBe('mongodb://db:27017/hkt');
    expect(remote.bucket).toEqual({ bucket: 'snaps', prefix: 'hkt', endpoint: 'https://s3.ap-northeast-2.amazonaws.com', region: 'ap-northeast-2', accessKey: 'id', secretKey: 'secret', sessionToken: null });
    expect(loadConfig(file, { SNAPSHOT_URI: 's3://snaps', S3_ENDPOINT: 'http://minio:9000/', AWS_ACCESS_KEY_ID: 'id', AWS_SECRET_ACCESS_KEY: 's' }).storage.bucket).toMatchObject({ prefix: '', endpoint: 'http://minio:9000', region: 'us-east-1' });
    expect(() => loadConfig(file, { SNAPSHOT_URI: 's3://snaps' })).toThrow(/AWS_ACCESS_KEY_ID/);
    expect(() => loadConfig(file, { SNAPSHOT_URI: 'snaps', AWS_ACCESS_KEY_ID: 'id', AWS_SECRET_ACCESS_KEY: 's' })).toThrow(/s3:\/\//);
  });

  it('스토리지에 닿지 않으면 시작 거부 — 흐름 1 의 1 이 failed', async () => {
    const c = config();
    await expect(Service.start({ ...c, storage: { ...c.storage, mongodbUri: 'mongodb://127.0.0.1:1/x?serverSelectionTimeoutMS=300' } }, 'k', () => {})).rejects.toThrow();
  });
});
