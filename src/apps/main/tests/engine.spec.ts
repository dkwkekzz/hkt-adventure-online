// 진짜 엔진 위의 조립 — engine/(npm run engine) 또는 ENGINE_DIR 이 있을 때만 돈다. 없으면 건너뛴다.
// plan 01 의 직관 확인: 서비스가 낸 토큰으로 Host 2 를 보내면 open(그 계정의 사람의 묶음), 이름 글은 4002.
// 세 계정이 같은 세계에 붙어 각자의 묶음을 받는다(엔진의 --party). 내렸다 다시 띄우면 저장된 세계에서 이어가고 낳은 묶음도 그대로다.

import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config';
import type { ServiceConfig } from '../config';
import { Service } from '../service';

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
const ENGINE = resolve(process.env['ENGINE_DIR'] ?? join(ROOT, 'engine'));
const have = existsSync(join(ENGINE, 'web', 'node_modules', '.bin', 'tsx'));

interface Opened {
  readonly bodies: number[] | null;
  readonly why: string | null;
  readonly code: number;
  readonly frames: number;
}

/** 엔진의 와이어 글(ONLINE.md §1.2)로 붙어 Link 1 과 창 몇을 받고 닫는다. */
function connect(ws: string, credential: string): Promise<Opened> {
  return new Promise((ok, fail) => {
    const socket = new WebSocket(ws);
    let bodies: number[] | null = null;
    let why: string | null = null;
    let frames = 0;
    const t = setTimeout(() => fail(new Error('기다리다 지쳤다')), 20000);
    socket.onopen = () => socket.send(JSON.stringify({ step: 'Host 2', credential }));
    socket.onmessage = (m) => {
      const msg = JSON.parse(String(m.data)) as { step: string; open?: { bodies: number[] }; reject?: { why: string } };
      if (msg.step === 'Link 1') {
        bodies = msg.open?.bodies ?? null;
        why = msg.reject?.why ?? null;
      }
      if (msg.step === 'Link 2' && ++frames === 2) socket.close(1000);
    };
    socket.onclose = (e) => {
      clearTimeout(t);
      ok({ bodies, why, code: e.code, frames });
    };
  });
}

describe.skipIf(!have)('진짜 엔진 — 토큰 · 한 세계에 사람 여럿 · 이어가기', () => {
  const services: Service[] = [];
  afterAll(async () => {
    for (const s of services) await s.stop();
  }, 60000);

  it('입장 · 접속 · 거절 · 같은 세계의 묶음 셋 · 다시 띄우면 이어간다', async () => {
    const base = loadConfig(join(ROOT, 'service.config.json'));
    const config: ServiceConfig = {
      ...base,
      apiPort: 0,
      storage: { ...base.storage, root: mkdtempSync(join(tmpdir(), 'svc-engine-')) }, // MONGODB_URI · SNAPSHOT_URI 가 있으면 그 뒤 위에서
      fleet: { ...base.fleet, engineDir: ENGINE, viewerOut: join(mkdtempSync(join(tmpdir(), 'viewer-')), 'viewer.js'), ports: [3290, 3299], clockMs: 60_000 },
    };
    const logs: string[] = [];
    const s = await Service.start(config, 'engine-test-key', (l) => logs.push(l));
    services.push(s);
    const post = async (path: string, body: unknown) => (await (await fetch(`http://localhost:${s.port}${path}`, { method: 'POST', body: JSON.stringify(body) })).json()) as Record<string, string>;

    const [a, b, c] = [await post('/login', { provider: 'guest' }), await post('/login', { provider: 'guest' }), await post('/login', { provider: 'guest' })];
    const at = await post('/enter', { token: a['token'] });
    const bt = await post('/enter', { token: b['token'] });
    expect(at['ws']).toBe(bt['ws']); // 같은 세계

    // 셋이 같은 세계에 붙고 각자의 묶음(요정 넷)을 받는다 — 붙어 있는 동안
    const opened = await Promise.all([a, b, c].map((x) => hold(at['ws']!, x['token']!)));
    for (const o of opened) {
      expect(o.bodies).toHaveLength(4);
      expect(o.frames).toBeGreaterThan(0);
    }
    expect(new Set(opened.flatMap((o) => o.bodies)).size).toBe(12); // 겹치지 않는다
    const world = s.fleet.shardOf('main')!;
    const status = (await world.command('status'))!;
    for (const x of [a, b, c]) expect(status).toContain(`${x['token']!.split('.')[1]}(`);
    expect(world.players).toBe(3);
    for (const o of opened) o.close();

    expect(await connect(at['ws']!, 'someone')).toMatchObject({ bodies: null, code: 4002 }); // 이름 글은 거절
    const again = await connect(at['ws']!, a['token']!);
    expect(again.bodies).toEqual(opened[0]!.bodies); // 다시 와도 같은 묶음

    await new Promise((r) => setTimeout(r, 1000)); // 몇 박자
    await s.stop();
    const s2 = await Service.start(config, 'engine-test-key', (l) => logs.push(l));
    services.push(s2);
    const a2 = (await (await fetch(`http://localhost:${s2.port}/login`, { method: 'POST', body: JSON.stringify({ provider: 'guest', subject: b['subject'] }) })).json()) as Record<string, string>;
    const at2 = (await (await fetch(`http://localhost:${s2.port}/enter`, { method: 'POST', body: JSON.stringify({ token: a2['token'] }) })).json()) as Record<string, string>;
    expect(at2['ws']).toBe(at['ws']);
    expect(s2.fleet.shardOf('main')!.resumed).toBe(true);
    expect((await connect(at2['ws']!, a2['token']!)).bodies).toEqual(opened[1]!.bodies); // 낳은 묶음도 이어진다
  }, 180000);
});

/** 붙어서 Link 1 과 창 몇을 받고, 닫기 전까지 붙어 있는다. */
function hold(ws: string, credential: string): Promise<{ bodies: number[]; frames: number; close: () => void }> {
  return new Promise((ok, fail) => {
    const socket = new WebSocket(ws);
    let bodies: number[] = [];
    let frames = 0;
    const t = setTimeout(() => fail(new Error('기다리다 지쳤다')), 20000);
    socket.onopen = () => socket.send(JSON.stringify({ step: 'Host 2', credential }));
    socket.onmessage = (m) => {
      const msg = JSON.parse(String(m.data)) as { step: string; open?: { bodies: number[] }; reject?: { why: string } };
      if (msg.step === 'Link 1' && msg.reject !== undefined) fail(new Error(msg.reject.why));
      if (msg.step === 'Link 1' && msg.open !== undefined) bodies = msg.open.bodies;
      if (msg.step === 'Link 2' && ++frames === 2) {
        clearTimeout(t);
        ok({ bodies, frames, close: () => socket.close(1000) });
      }
    };
  });
}
