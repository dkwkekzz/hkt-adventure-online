// Service.start · Api login · enter · Service.stop (흐름 1 · 2 · 3 · 7) — 가짜 엔진 위에서, http 로.

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
    tokenTtl: 3600,
    agentTtl: 60,
    fleet: {
      engineDir: fakeEngine(),
      dataset: 'dataset/world.json',
      keymap: null,
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

  it('GET / 는 게스트 페이지, /health 는 ok', async () => {
    const { base } = await up();
    expect(await (await fetch(base + '/')).text()).toContain('/login');
    expect(await (await fetch(base + '/health')).text()).toBe('ok');
    expect((await fetch(base + '/nope')).status).toBe(404);
  });

  it('login → enter — 같은 주체는 같은 계정 · 같은 샤드, 다른 주체는 다른 샤드. 틀린 토큰 · 제공자는 거절', async () => {
    const { s, post } = await up();
    const a = await post('/login', { provider: 'guest' });
    expect(a.code).toBe(200);
    expect(a.body['token']).toMatch(/^hkt1\.p[0-9a-f]{12}\.\d+\./);
    const a2 = await post('/login', { provider: 'guest', subject: a.body['subject'] });
    expect(a2.body['token']!.split('.')[1]).toBe(a.body['token']!.split('.')[1]);
    const b = await post('/login', { provider: 'guest' });

    const ea = await post('/enter', { token: a.body['token'] });
    expect(ea.code).toBe(200);
    expect(ea.body['page']).toBe(`http://localhost:${s.config.fleet.ports[0]}/?token=${encodeURIComponent(a.body['token']!)}`);
    const eb = await post('/enter', { token: b.body['token'] });
    expect(eb.body['ws']).toBe(`ws://localhost:${s.config.fleet.ports[0] + 1}`);
    expect(s.fleet.shards.size).toBe(2);

    expect((await post('/enter', { token: a.body['token']!.replace(/.$/, 'x') })).code).toBe(400);
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
    expect(second.s.fleet.shardOf(a.body['token']!.split('.')[1]!)?.state).toBe('stopped');
    const again = await second.post('/login', { provider: 'guest', subject: a.body['subject'] });
    expect(again.body['token']!.split('.')[1]).toBe(a.body['token']!.split('.')[1]);
    expect((await second.post('/enter', { token: again.body['token'] })).code).toBe(200);
    expect(second.s.fleet.shardOf(again.body['token']!.split('.')[1]!)?.resumed).toBe(true);
  });

  it('loadConfig — 상대 경로는 파일의 자리에서, env 가 몇 칸을 덮는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
    const file = join(dir, 'service.config.json');
    const c = config();
    writeFileSync(file, JSON.stringify({ ...c, storageRoot: 'out/storage', fleet: { ...c.fleet, engineDir: 'engine' } }));
    const read = loadConfig(file, { PORT: '9001', SERVICE_PUBLIC_HOST: 'play.test', SERVICE_SECURE: '1' });
    expect(read.storageRoot).toBe(join(dir, 'out/storage'));
    expect(read.fleet.engineDir).toBe(join(dir, 'engine'));
    expect(read.apiPort).toBe(9001);
    expect(read.fleet.publicHost).toBe('play.test');
    expect(read.fleet.secure).toBe(true);
  });
});
