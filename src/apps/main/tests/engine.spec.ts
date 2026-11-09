// 진짜 엔진 위의 조립 — engine/(npm run engine) 또는 ENGINE_DIR 이 있을 때만 돈다. 없으면 건너뛴다.
// plan stage 4 · 5 · 6 의 직관 확인: 서비스가 낸 토큰으로 Host 2 를 보내면 open(플레이어 묶음), 이름 글은 4002.
// 두 계정은 각자의 샤드(다른 포트)에 붙고 서로의 접속이 보이지 않는다. 내렸다 다시 띄우면 저장된 세계에서 이어간다.

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

describe.skipIf(!have)('진짜 엔진 — 토큰 · 샤드 둘 · 이어가기', () => {
  const services: Service[] = [];
  afterAll(async () => {
    for (const s of services) await s.stop();
  }, 60000);

  it('입장 · 접속 · 거절 · 둘의 샤드 · 다시 띄우면 이어간다', async () => {
    const base = loadConfig(join(ROOT, 'service.config.json'));
    const config: ServiceConfig = {
      ...base,
      apiPort: 0,
      storageRoot: mkdtempSync(join(tmpdir(), 'svc-engine-')),
      fleet: { ...base.fleet, engineDir: ENGINE, ports: [3290, 3299], clockMs: 60_000 },
    };
    const logs: string[] = [];
    const s = await Service.start(config, 'engine-test-key', (l) => logs.push(l));
    services.push(s);
    const post = async (path: string, body: unknown) => (await (await fetch(`http://localhost:${s.port}${path}`, { method: 'POST', body: JSON.stringify(body) })).json()) as Record<string, string>;

    const a = await post('/login', { provider: 'guest' });
    const b = await post('/login', { provider: 'guest' });
    const at = await post('/enter', { token: a['token'] });
    const bt = await post('/enter', { token: b['token'] });
    expect(at['ws']).not.toBe(bt['ws']);

    const opened = await connect(at['ws']!, a['token']!);
    expect(opened.bodies?.length).toBeGreaterThan(0); // 플레이어 묶음 — NPC 묶음은 --grant 가 먼저 묶었다
    expect(opened.frames).toBe(2);
    expect((await connect(bt['ws']!, b['token']!)).bodies).toEqual(opened.bodies); // 같은 데이터셋 · 다른 세계 — 같은 번호의 묶음
    expect(await connect(at['ws']!, 'someone')).toMatchObject({ bodies: null, code: 4002 }); // 이름 글은 거절
    expect(await connect(at['ws']!, b['token']!)).toMatchObject({ bodies: null, code: 4002 }); // b 의 토큰은 서명이 맞아도 a 의 세계에 빈 묶음이 없다 — 남의 세계에 들지 못한다
    const aShard = s.fleet.shardOf(a['token']!.split('.')[1]!)!;
    expect(await aShard.command('status')).toMatch(/^beats \d+ · now \d+ · 돈다 · /);

    await new Promise((r) => setTimeout(r, 1000)); // 몇 박자
    await s.stop();
    const again = await Service.start(config, 'engine-test-key', (l) => logs.push(l));
    services.push(again);
    const a2 = (await (await fetch(`http://localhost:${again.port}/login`, { method: 'POST', body: JSON.stringify({ provider: 'guest', subject: a['subject'] }) })).json()) as Record<string, string>;
    const at2 = (await (await fetch(`http://localhost:${again.port}/enter`, { method: 'POST', body: JSON.stringify({ token: a2['token'] }) })).json()) as Record<string, string>;
    expect(at2['ws']).toBe(at['ws']);
    expect(again.fleet.shardOf(a2['token']!.split('.')[1]!)!.resumed).toBe(true);
    expect((await connect(at2['ws']!, a2['token']!)).bodies).toEqual(opened.bodies);
  }, 180000);
});
