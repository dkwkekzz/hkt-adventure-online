// 진짜 엔진 위의 조립 — engine/(npm run engine) 또는 ENGINE_DIR 이 있을 때만 돈다. 없으면 건너뛴다.
// plan 01 의 직관 확인: 서비스가 낸 토큰으로 Host 2 를 보내면 open(그 캐릭터의 사람의 묶음), 이름 글은 4002.
// 세 계정이 캐릭터를 만들어 고르고 같은 세계에 붙어 각자의 묶음을 받는다(엔진의 --party — 엔진에게는 캐릭터가 계정이다).
// 한 계정의 캐릭터 둘은 엔진에게 다른 계정 — 다른 묶음이다(plan 05). status 에 틱 지연, backup 이 통째의 사본과 끝 줄을 낸다(plan 06).
// 내렸다 다시 띄우면 저장된 세계에서 이어가고 낳은 묶음도 그대로다.

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
      monitorPort: 0, // 떠 있는 서비스(8001)와 다투지 않게
      storage: { ...base.storage, root: mkdtempSync(join(tmpdir(), 'svc-engine-')) }, // MONGODB_URI · SNAPSHOT_URI 가 있으면 그 뒤 위에서
      gateway: { ...base.gateway, port: 3289 },
      gateUrl: 'ws://localhost:3289',
      fleet: { ...base.fleet, engineDir: ENGINE, viewerOut: join(mkdtempSync(join(tmpdir(), 'viewer-')), 'viewer.js'), ports: [3290, 3299], clockMs: 60_000, spool: mkdtempSync(join(tmpdir(), 'spool-')) },
    };
    const logs: string[] = [];
    const s = await Service.start(config, 'engine-test-key', (l) => logs.push(l));
    services.push(s);
    const api = (port: number) => async (path: string, body: unknown) => (await (await fetch(`http://localhost:${port}${path}`, { method: 'POST', body: JSON.stringify(body) })).json()) as Record<string, string>;
    const post = api(s.port);
    /** 로그인(흐름 2) → 첫 캐릭터를 고르거나 만들어 고른다(흐름 8) → 캐릭터의 토큰 */
    const player = async (p: typeof post, name: string, subject?: string) => {
      const login = await p('/login', { provider: 'guest', ...(subject === undefined ? {} : { subject }) });
      const list = (await p('/characters', { token: login['token'] })) as unknown as { characters: { id: string }[] };
      const id = list.characters[0]?.id ?? ((await p('/create', { token: login['token'], name })) as unknown as { character: { id: string } }).character.id;
      const chosen = await p('/choose', { token: login['token'], character: id });
      return { subject: login['subject']!, account: login['token']!, character: id, token: chosen['token']! };
    };

    // 뷰어의 Keymap — 설정의 자리가 이 엔진 체크아웃에 있다(없으면 뷰어는 단축키 없이 메뉴로만 고른다)
    const keymap = await fetch(`http://localhost:${s.port}/keymap.json`);
    expect(keymap.status).toBe(200);
    expect(((await keymap.json()) as { keys?: unknown[] }).keys?.length).toBeGreaterThan(0);
    expect(logs.some((l) => l.includes('Keymap 이 없다'))).toBe(false);

    const [a, b, c] = [await player(post, '하나'), await player(post, '둘'), await player(post, '셋')];
    const at = await post('/enter', { token: a.token });
    const bt = await post('/enter', { token: b.token });
    expect(at['gate']).toBe('ws://localhost:3289'); // 게이트웨이 하나 — 호스트의 주소는 가지 않는다
    expect(bt['gate']).toBe(at['gate']);
    expect(await connect(at['gate']!, c.token)).toMatchObject({ bodies: null, code: 4002 }); // 입장하지 않았다 — 세션이 없다
    expect(await connect(at['gate']!, c.account)).toMatchObject({ bodies: null, code: 4002 }); // 계정의 토큰은 게이트웨이를 지나지 못한다
    await post('/enter', { token: c.token });

    // 셋이 게이트웨이를 지나 같은 세계에 붙고 각자의 묶음(요정 넷)을 받는다 — 붙어 있는 동안
    const opened = await Promise.all([a, b, c].map((x) => hold(at['gate']!, x.token)));
    for (const o of opened) {
      expect(o.bodies).toHaveLength(4);
      expect(o.frames).toBeGreaterThan(0);
    }
    expect(new Set(opened.flatMap((o) => o.bodies)).size).toBe(12); // 겹치지 않는다
    const world = s.node!.runner.get('main-1')!;
    const status = (await s.node!.console.command('main-1', 'status'))!;
    for (const x of [a, b, c]) expect(status).toContain(`${x.character}(`); // 엔진의 계정은 캐릭터
    expect(world.players).toBe(3);
    for (const o of opened) o.close();

    expect(await connect(at['gate']!, 'someone')).toMatchObject({ bodies: null, code: 4002 }); // 이름 글은 거절
    const again = await connect(at['gate']!, a.token);
    expect(again.bodies).toEqual(opened[0]!.bodies); // 다시 와도 같은 묶음(유예 안 — 세션이 그대로)

    // 한 계정의 다른 캐릭터 — 엔진에게는 다른 계정, 다른 묶음. 들어가면 앞 캐릭터의 세션은 없다
    const second = ((await post('/create', { token: a.account, name: '하나의 둘' })) as unknown as { character: { id: string } }).character.id;
    const t2 = (await post('/choose', { token: a.account, character: second }))['token']!;
    expect((await post('/enter', { token: t2 }))['gate']).toBe(at['gate']);
    const other = await connect(at['gate']!, t2);
    expect(other.bodies).toHaveLength(4);
    expect(new Set([...other.bodies!, ...opened.flatMap((o) => o.bodies)]).size).toBe(16);
    expect(await connect(at['gate']!, a.token)).toMatchObject({ bodies: null, code: 4002, why: '세션이 없다 — 먼저 입장' });

    // 엔진의 면(plan 06) — status 의 꼬리는 틱 지연, backup 은 다음 창 끝의 저장을 통째로 베끼고 끝 줄을 찍는다(Probe.read 의 backed)
    expect(world.lastStatus!.text).toMatch(/ · 지연 \d+$/);
    expect(world.lag).toBe(world.lastStatus!.lag);
    const copy = join(mkdtempSync(join(tmpdir(), 'svc-backup-')), 'b1');
    expect(await s.node!.console.command('main-1', `backup ${copy}`)).toBe(`backup — 다음 창 끝에 ${copy} 에 베낀다`);
    for (let i = 0; i < 100 && world.backed === null; i++) await new Promise((r) => setTimeout(r, 50));
    expect(world.backed).toMatchObject({ dir: copy, error: null });
    expect(existsSync(join(copy, 'manifest.json'))).toBe(true); // 그 자체로 저장 자리 — 목록과 그것이 가리키는 파일

    await new Promise((r) => setTimeout(r, 1000)); // 몇 박자
    await s.stop(); // 흐름 7 의 3 — 로드된 캐릭터의 값을 내려 저장한다
    const s2 = await Service.start(config, 'engine-test-key', (l) => logs.push(l));
    services.push(s2);
    const post2 = api(s2.port);
    const b2 = await player(post2, '-', b.subject);
    expect(b2.character).toBe(b.character); // 같은 계정의 같은 캐릭터 — 표에서
    const at2 = await post2('/enter', { token: b2.token });
    expect(at2['gate']).toBe(at['gate']);
    expect(s2.node!.runner.get('main-1')!.resumed).toBe(true);
    expect(await s2.storage.characters.read(b2.character, join(mkdtempSync(join(tmpdir(), 'value-')), 'v.json'))).toBe(true); // 캐릭터의 값은 스토리지에
    expect((await connect(at2['gate']!, b2.token)).bodies).toHaveLength(4); // 그 값으로 다시 선다(세계의 번호는 새로)
    expect(s2.monitor.recent.find((t) => t.flow === 9 && t.step === 6)).toMatchObject({ counts: { found: 1 } });
  }, 180000);
});

describe.skipIf(!have)('진짜 엔진 — 인스턴스 여럿 · 비움 · 장애 복구 (plan 07)', () => {
  const services: Service[] = [];
  afterAll(async () => {
    for (const s of services) await s.stop();
  }, 60000);

  it('상한 1 의 존에 둘이 들어가면 인스턴스 둘. drain 하면 사람이 다른 인스턴스로 옮겨지고 접속은 끊기지 않는다. 호스트를 죽여도 마지막으로 저장한 값으로 다시 선다', async () => {
    const base = loadConfig(join(ROOT, 'service.config.json'));
    const config: ServiceConfig = {
      ...base,
      apiPort: 0,
      monitorPort: 0,
      zones: [{ ...base.zones[0]!, capacity: 1, spare: 0 }],
      storage: { ...base.storage, root: mkdtempSync(join(tmpdir(), 'svc-engine7-')) },
      gateway: { ...base.gateway, port: 3309, rerouteMs: 60_000 },
      gateUrl: 'ws://localhost:3309',
      fleet: { ...base.fleet, engineDir: ENGINE, viewerOut: join(mkdtempSync(join(tmpdir(), 'viewer-')), 'viewer.js'), ports: [3310, 3319], clockMs: 60_000, node: { name: 'node-1', slots: 4 }, spool: mkdtempSync(join(tmpdir(), 'spool-')) },
    };
    const s = await Service.start(config, 'engine-test-key', (l) => process.env['ENGINE_LOG'] !== undefined && console.log(l), 'operator-test-key');
    services.push(s);
    const post = async (path: string, body: unknown) => (await (await fetch(`http://localhost:${s.port}${path}`, { method: 'POST', body: JSON.stringify(body) })).json()) as Record<string, string>;
    const player = async (name: string) => {
      const login = await post('/login', { provider: 'guest' });
      const id = ((await post('/create', { token: login['token'], name })) as unknown as { character: { id: string } }).character.id;
      return { character: id, token: (await post('/choose', { token: login['token'], character: id }))['token']! };
    };
    const a = await player('하나');
    const b = await player('둘');
    const gate = (await post('/enter', { token: a.token }))['gate']!;
    const wa = await watch(gate, a.token);
    await wa.opened(1);
    expect((await post('/enter', { token: b.token }))['gate']).toBe(gate);
    const wb = await watch(gate, b.token);
    await wb.opened(1);
    expect(s.fleet!.registry.all().map((i) => `${i.name} ${i.state}`)).toEqual(['main-1 ready', 'main-2 ready']); // 상한 1 — 둘째가 띄웠다
    expect(s.node!.loader.of('main-1')).toEqual([a.character]);

    // 비움 — 하나를 main-1 에서 다른 인스턴스로(빈 곳이 없어 main-3 을 띄운다). 접속은 그대로, 뷰어는 다시 온 열림을 받는다
    expect(await s.operator!.command(s.console!, 'drain main-1')).toMatch(/옮겼다 — 1$/);
    await wa.opened(2);
    expect(wa.closed).toBeNull();
    expect(s.node!.loader.of('main-1')).toEqual([]);
    expect(s.node!.loader.of('main-3')).toEqual([a.character]);
    const move = s.monitor.recent.find((t) => t.flow === 10 && t.step === 1)!.run;
    expect(s.monitor.recent.filter((t) => t.run === move && t.flow === 10).map((t) => t.step)).toEqual([1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11, 12]); // 한 run — 3 의 B 도 같은 run
    const frames = wa.frames;
    await new Promise((r) => setTimeout(r, 1000));
    expect(wa.frames).toBeGreaterThan(frames); // 새 세계의 창이 흐른다

    // 장애 — main-3 의 호스트를 죽인다. lease 를 끊고 같은 이름으로 다시 띄워 마지막으로 저장한 값(내리며 쓴 것)으로 세운다
    s.node!.runner.get('main-3')!.host!.kill('SIGKILL');
    await wa.opened(3);
    expect(wa.closed).toBeNull();
    const rec = s.monitor.recent.find((t) => t.flow === 12 && t.step === 1)!.run;
    expect(s.monitor.recent.filter((t) => t.run === rec && t.flow === 12).map((t) => `${t.step}.${t.end}`)).toEqual(['1.ok', '2.ok', '3.ok', '4.ok', '5.ok']); // 6 은 없다 — 사람을 옮기며(5) 같은 이름으로 이미 다시 띄웠다
    expect(s.monitor.recent.find((t) => t.run === rec && t.flow === 9 && t.step === 6)).toMatchObject({ counts: { found: 1 } });
    expect(s.fleet!.registry.get('main-3')).toMatchObject({ state: 'ready', epoch: 2, restarts: 0 });
    expect(s.node!.loader.of('main-3')).toEqual([a.character]);
    expect(wb.closed).toBeNull(); // 다른 인스턴스의 사람은 모른다
    wa.ws.close(1000);
    wb.ws.close(1000);
  }, 240000);
});

/** 붙어서 받은 글을 센다 — Link 1 의 열림 · 창 · 닫힘. 한 번 붙은 소켓이 끝까지 하나다. */
function watch(ws: string, credential: string): Promise<{ ws: WebSocket; readonly frames: number; readonly closed: number | null; opened(n: number): Promise<void> }> {
  return new Promise((ok) => {
    const socket = new WebSocket(ws);
    let opens = 0;
    let frames = 0;
    let closed: number | null = null;
    socket.onopen = () => {
      socket.send(JSON.stringify({ step: 'Host 2', credential }));
      ok({
        ws: socket,
        get frames() {
          return frames;
        },
        get closed() {
          return closed;
        },
        async opened(n: number) {
          for (let i = 0; i < 1200 && opens < n; i++) {
            if (closed !== null) throw new Error(`닫혔다 — ${closed}`);
            await new Promise((r) => setTimeout(r, 50));
          }
          if (opens < n) throw new Error(`열림이 ${n} 번 오지 않았다 — ${opens}`);
        },
      });
    };
    socket.onmessage = (m) => {
      const msg = JSON.parse(String(m.data)) as { step: string; open?: unknown };
      if (msg.step === 'Link 1' && msg.open !== undefined) opens++;
      if (msg.step === 'Link 2') frames++;
    };
    socket.onclose = (e) => (closed = e.code);
  });
}

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
