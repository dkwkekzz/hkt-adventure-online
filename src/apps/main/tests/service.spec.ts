// Service.start · Api login · enter · Service.stop (흐름 1 · 2 · 3 · 7)과 그 흔적(흐름 14) — 가짜 엔진 위에서, http 로.

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeEngine, portRange } from '../../../fleet/tests/fake';
import { loadConfig } from '../config';
import type { ServiceConfig } from '../config';
import { Service } from '../service';

let services: Service[] = [];
afterEach(async () => {
  await Promise.all(services.map((s) => s.stop()));
  services = [];
});

function config(storageRoot = mkdtempSync(join(tmpdir(), 'svc-')), ports = portRange()): ServiceConfig {
  return {
    storageRoot,
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
      publicHost: 'localhost',
      secure: false,
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
    expect(ea.body['ws']).toBe(`ws://localhost:${s.config.fleet.ports[0]}`);
    expect(ea.body['page']).toBe(`http://play.test/play?token=${encodeURIComponent(a.body['token']!)}&ws=${encodeURIComponent(ea.body['ws']!)}`);
    const eb = await post('/enter', { token: b.body['token'] });
    expect(eb.body['ws']).toBe(ea.body['ws']); // 같은 세계
    expect(s.fleet.shards.size).toBe(1);

    const t = a.body['token']!;
    const at = t.lastIndexOf('.') + 1;
    const bad = `${t.slice(0, at)}${t[at] === 'A' ? 'B' : 'A'}${t.slice(at + 1)}`; // 서명의 첫 글자를 바꾼다
    expect((await post('/enter', { token: bad })).code).toBe(400);
    expect((await post('/login', { provider: 'oauth' })).code).toBe(400);
    expect((await post('/login', { provider: 'guest', subject: 'a b' })).code).toBe(400);
  });

  it('stop 뒤 다시 start — 사용자 표 · 배정 표가 저장장치에서 되돌아온다', async () => {
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

  it('Monitor.trace — 흐름 1 · 2 · 3 · 7 의 단계가 차례로 흔적을 남긴다. 한 입장은 run 하나로 Api · 함대를 잇는다', async () => {
    const { s, post } = await up();
    const steps = (flow: number, run?: string) => s.monitor.recent.filter((t) => t.flow === flow && (run === undefined || t.run === run)).map((t) => `${t.step}.${t.end}`);
    expect(steps(1)).toEqual(['7.ok', '1.ok', '2.ok', '3.wait']);
    const a = await post('/login', { provider: 'guest' });
    expect(steps(2)).toEqual(['1.ok', '2.ok', '4.ok', '5.wait']);
    await post('/enter', { token: a.body['token'] });
    const run = s.monitor.recent.find((t) => t.flow === 3)!.run;
    expect(steps(3, run)).toEqual(['1.ok', '2.ok', '14.ok', '11.ok', '15.ok', '16.ok', '17.ok', '18.ok', '19.ok', '9.wait']);
    expect(s.monitor.units.get('main')).toMatchObject({ state: 'ready' });
    await post('/enter', { token: 'nope' });
    expect(s.monitor.tally.get('3.2.refused')).toBe(1);
    expect(s.monitor.recent.every((t) => !JSON.stringify(t).includes(a.body['token']!) && !JSON.stringify(t).includes(a.body['subject']!))).toBe(true);
    const monitor = s.monitor;
    await s.stop();
    const stop = monitor.recent.filter((t) => t.flow === 7).map((t) => `${t.step}.${t.state ?? ''}`);
    expect(stop).toEqual(['4.stopping', '10.']);
    expect(monitor.units.get('main')?.state).toBe('stopped'); // 흐름 4 의 5 — 호스트가 끝났다
  });

  it('loadConfig — 상대 경로는 파일의 자리에서, env 가 몇 칸을 덮는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
    const file = join(dir, 'service.config.json');
    const c = config();
    const { pageUrl: _, ...fleet } = c.fleet;
    writeFileSync(file, JSON.stringify({ ...c, storageRoot: 'out/storage', fleet: { ...fleet, engineDir: 'engine', viewerOut: 'out/viewer/viewer.js' } }));
    const read = loadConfig(file, { PORT: '9001', MONITOR_PORT: '9002', SERVICE_PUBLIC_HOST: 'play.test', SERVICE_SECURE: '1' });
    expect(read.storageRoot).toBe(join(dir, 'out/storage'));
    expect(read.fleet.engineDir).toBe(join(dir, 'engine'));
    expect(read.fleet.viewerOut).toBe(join(dir, 'out/viewer/viewer.js'));
    expect(read.apiPort).toBe(9001);
    expect(read.monitorPort).toBe(9002);
    expect(read.build).toBe('-'); // 곁에 engine.lock 이 없다
    expect(read.fleet.publicHost).toBe('play.test');
    expect(read.fleet.secure).toBe(true);
    expect(read.fleet.pageUrl).toBe('https://play.test:9001/play');
    expect(loadConfig(file, { SERVICE_PAGE_URL: 'https://play.test/play' }).fleet.pageUrl).toBe('https://play.test/play');
  });
});
