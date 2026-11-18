// Service.start · Api login · characters · create · choose · delete · enter · Service.stop (흐름 1 · 2 · 8 · 3 · 7) · 세션(흐름 9 · 11 · 5)과 그 흔적(흐름 14) — 가짜 엔진 위에서, http 로.

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

/** 포트 다섯 — 넷은 호스트. 게이트웨이는 빈 포트(0)에 서고 제 주소를 알린다(gateUrl 이 비면 `ws://localhost:<port>`). */
function config(storageRoot = mkdtempSync(join(tmpdir(), 'svc-')), range = portRange()): ServiceConfig {
  const ports: [number, number] = [range[0], range[1] - 1];
  return {
    gateway: { port: 0, helloMs: 2000, rerouteMs: 500, pongMs: 5000, maxBytes: 65536, maxRate: 100, ipLimit: 32 },
    session: { pendingMs: 60_000, graceMs: 60_000, gateLimitMs: 120_000, queueForgetMs: 60_000 },
    zones: [{ name: 'main', dataset: 'dataset/world.json', capacity: 8, spare: 0 }],
    pageUrl: 'http://play.test/play',
    gateUrl: '',
    storage: { root: storageRoot, mongodbUri: null, bucket: null, leaseMs: 1000, characterHistory: 2 },
    apiPort: 0,
    monitorPort: 0,
    traceKeep: 200,
    build: 'test',
    tokenTtl: 3600,
    characterTtl: 600,
    characterLimit: 3,
    agentTtl: 60,
    keymap: 'dataset/keymaps',
    scheme: 'over',
    fleet: {
      engineDir: fakeEngine(),
      party: 'lead-1',
      viewerOut: join(storageRoot, 'viewer', 'viewer.js'),
      beat: 200,
      sparse: 10,
      npc: { account: 'npc', bodies: ['b1'] },
      ports,
      hostName: 'localhost',
      node: { name: 'node-1', slots: 4 },
      spool: join(storageRoot, 'spool'),
      clockMs: 60_000,
      idleLimit: 3,
      startLimitMs: 5000,
      stopLimitMs: 2000,
      commandLimitMs: 1000,
      restartLimit: 2,
      backupEvery: 0,
      backupKeep: 3,
      reportLimitMs: 60_000,
      closingMs: 1000,
    },
    role: 'main',
    rpc: { host: 'localhost', controlPort: 0, nodePort: 0, gatewayPort: 0, limitMs: 2000 },
    leader: { ttlMs: 3000, settleMs: 2000 },
    operators: ['console'],
    accountIdleMs: 3600_000,
  };
}

type J = Record<string, any>;

async function up(c: ServiceConfig = config()) {
  const s = await Service.start(c, 'k', () => {});
  services.push(s);
  const base = `http://localhost:${s.port}`;
  const post = async (path: string, body: unknown) => {
    const r = await fetch(base + path, { method: 'POST', body: JSON.stringify(body) });
    return { code: r.status, body: (await r.json()) as J };
  };
  /** 사람 하나 — 로그인(흐름 2) · 캐릭터를 만들고 고른다(흐름 8). subject 가 있으면 그 계정의 첫 캐릭터를 고른다 */
  const player = async (name = '손님', subject?: string) => {
    const login = await post('/login', { provider: 'guest', ...(subject === undefined ? {} : { subject }) });
    const account = login.body['token'] as string;
    const list = (await post('/characters', { token: account })).body['characters'] as { id: string; name: string }[];
    const character = list[0] ?? ((await post('/create', { token: account, name })).body['character'] as { id: string; name: string });
    const token = (await post('/choose', { token: account, character: character.id })).body['token'] as string;
    return { subject: login.body['subject'] as string, account, character, token };
  };
  return { s, base, post, player };
}

describe('Service — 흐름 1 · 2 · 3 · 7', () => {
  it('키가 없으면 시작 거부', async () => {
    await expect(Service.start(config(), '')).rejects.toThrow(/HOST_AUTH_KEY/);
  });

  it('GET / 는 게스트 페이지. /health 는 Api 에 없고 Monitor 의 내부 주소에', async () => {
    const { s, base } = await up();
    expect(await (await fetch(base + '/')).text()).toContain('/login');
    expect((await fetch(base + '/health')).status).toBe(404);
    expect(await (await fetch(`http://localhost:${s.monitor.port}/health`)).text()).toBe('ok active'); // main 은 컨트롤 플레인을 든다 — 자리(흐름 13)도 답한다
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
    expect(await get('/keymap.json')).toMatchObject({ code: 200, text: '{"form":"2.5d"}\n' }); // 조작 틀의 폴더 — 기본 틀(over)
    expect(await get('/keymap.json?scheme=third')).toMatchObject({ code: 200, text: '{"form":"3d"}\n' }); // 페이지가 고른 틀
    expect((await get('/keymap.json?scheme=nope')).code).toBe(404); // 없는 틀 — 뷰어는 메뉴로만
    expect((await get('/keymap.json?scheme=..%2Fworld')).code).toBe(404);
    expect((await get('/assets/%2e%2e/apps/viewer/page.html')).code).toBe(404);
    expect((await get('/assets/ext/%2e%2e/%2e%2e/web/assets/index.json')).code).toBe(404);
    expect((await get('/assets/images')).code).toBe(404); // 폴더
  });

  it('login → characters · create · choose → enter — 같은 주체는 같은 계정(a…). 계정의 토큰으로는 입장하지 못하고 캐릭터의 토큰(p…)으로만. 사람은 같은 세계', async () => {
    const { s, post, player } = await up();
    const a = await post('/login', { provider: 'guest' });
    expect(a.code).toBe(200);
    expect(a.body['token']).toMatch(/^hkt1\.a[0-9a-f]{12}\.\d+\./);
    const a2 = await post('/login', { provider: 'guest', subject: a.body['subject'] });
    expect(a2.body['token'].split('.')[1]).toBe(a.body['token'].split('.')[1]);
    expect((await post('/characters', { token: a.body['token'] })).body).toEqual({ characters: [] });
    const made = await post('/create', { token: a.body['token'], name: '하나' });
    expect(made.body['character']).toEqual({ id: expect.stringMatching(/^p[0-9a-f]{12}$/), name: '하나' });
    expect((await post('/create', { token: a.body['token'], name: '' })).code).toBe(400);
    expect((await post('/characters', { token: a2.body['token'] })).body['characters']).toEqual([made.body['character']]); // 같은 계정
    const chosen = await post('/choose', { token: a.body['token'], character: made.body['character'].id });
    expect(chosen.body['token']).toMatch(/^hkt1\.p[0-9a-f]{12}\.\d+\./);
    expect((await post('/enter', { token: a.body['token'] })).code).toBe(400); // 계정의 토큰은 Api 에만
    expect((await post('/characters', { token: chosen.body['token'] })).code).toBe(400); // 캐릭터의 토큰은 캐릭터를 다루지 못한다

    const ea = await post('/enter', { token: chosen.body['token'] });
    expect(ea.code).toBe(200);
    expect(ea.body['gate']).toBe(`ws://localhost:${s.gateway!.port}`); // 게이트웨이 하나 — 호스트의 주소는 가지 않는다
    expect(ea.body['page']).toBe(`http://play.test/play?token=${encodeURIComponent(chosen.body['token'])}&ws=${encodeURIComponent(ea.body['gate'])}`);
    const b = await player('둘');
    const eb = await post('/enter', { token: b.token });
    expect(eb.body['gate']).toBe(ea.body['gate']);
    expect(s.fleet!.registry.all().map((i) => i.name)).toEqual(['main-1']); // 상한 안 — 같은 인스턴스
    // 다른 계정의 캐릭터는 고르지도 지우지도 못한다
    expect((await post('/choose', { token: b.account, character: made.body['character'].id })).body).toEqual({ why: '이 계정의 캐릭터가 아니다' });
    expect((await post('/delete', { token: b.account, character: made.body['character'].id })).code).toBe(400);

    const t = chosen.body['token'] as string;
    const at = t.lastIndexOf('.') + 1;
    const bad = `${t.slice(0, at)}${t[at] === 'A' ? 'B' : 'A'}${t.slice(at + 1)}`; // 서명의 첫 글자를 바꾼다
    expect((await post('/enter', { token: bad })).code).toBe(400);
    expect((await post('/login', { provider: 'oauth' })).code).toBe(400);
    expect((await post('/login', { provider: 'guest', subject: 'a b' })).code).toBe(400);
  });

  it('지우기 — 놀고 있으면(세션) 거절, 아니면 줄 · 값 · 마지막 존을 지운다(흐름 8 의 6 · 8 ~ 11)', async () => {
    const { s, post, player } = await up();
    const a = await player('하나');
    await post('/enter', { token: a.token });
    expect((await post('/delete', { token: a.account, character: a.character.id })).body).toEqual({ why: '놀고 있는 캐릭터다 — 접속을 끊고 유예가 지난 뒤 다시' });
    const two = (await post('/create', { token: a.account, name: '둘' })).body['character'] as { id: string };
    expect((await post('/delete', { token: a.account, character: two.id })).body).toEqual({ deleted: two.id });
    expect(((await post('/characters', { token: a.account })).body['characters'] as { name: string }[]).map((c) => c.name)).toEqual(['하나']);
    const run = s.monitor.recent.find((t) => t.flow === 8 && t.step === 9)!.run;
    expect(s.monitor.recent.filter((t) => t.run === run).map((t) => `${t.flow}.${t.step}.${t.end}`)).toEqual(['8.1.ok', '8.2.ok', '8.3.ok', '8.6.ok', '8.8.ok', '8.9.ok', '8.10.ok', '8.11.ok']); // 한 run — api 에서 control 로
  });

  it('차단된 계정 — 로그인 · 캐릭터 · 입장이 모두 거절되고, 거절이 그 사람(가명)의 흔적에 남는다', async () => {
    const { s, post, player } = await up();
    const a = await player('하나');
    const account = a.account.split('.')[1]!;
    await s.banlist!.ban(account, Date.now() + 60_000); // 운영자의 ban(흐름 6 — plan 08) 대신 표에
    expect((await post('/enter', { token: a.token })).body).toEqual({ why: '차단된 계정이다' });
    expect((await post('/characters', { token: a.account })).body).toEqual({ why: '차단된 계정이다' });
    expect((await post('/login', { provider: 'guest', subject: a.subject })).body).toEqual({ why: '차단된 계정이다' });
    const who = s.monitor.recent.find((t) => t.flow === 2 && t.step === 5)!.who;
    expect(s.monitor.recent.filter((t) => t.who === who && t.end === 'refused').map((t) => `${t.flow}.${t.step}`)).toEqual(['3.3', '8.3', '2.3']);
  });

  it('한 계정에 캐릭터 둘 — 따로 들어가면 나중 입장이 이긴다: 앞 캐릭터의 접속은 4000, 그 세션은 없다', async () => {
    const { post, player } = await up();
    const a = await player('하나');
    const two = (await post('/create', { token: a.account, name: '둘' })).body['character'] as { id: string };
    const t2 = (await post('/choose', { token: a.account, character: two.id })).body['token'] as string;
    const gate = (await post('/enter', { token: a.token })).body['gate'] as string;
    const first = await link(gate, a.token);
    expect(first.first).toMatchObject({ step: 'Link 1', open: expect.anything() });
    expect((await post('/enter', { token: t2 })).code).toBe(200);
    expect(await first.code).toBe(4000);
    const second = await link(gate, t2);
    expect(second.first).toMatchObject({ step: 'Link 1', open: expect.anything() });
    const again = await link(gate, a.token); // 앞 캐릭터는 세션이 없다
    expect(again.first).toEqual({ step: 'Link 1', reject: { why: '세션이 없다 — 먼저 입장' } });
    second.ws.close(1000);
  });

  it('대기열 — 상한을 넘는 입장은 순번을 받고(200), 슬롯이 나면(유예가 지나 11 의 4 ~ 6) 다음 물음이 주소를 받는다', async () => {
    const c = config();
    const { s, post, player } = await up({ ...c, zones: [{ ...c.zones[0]!, capacity: 1 }], session: { ...c.session, graceMs: 200 }, fleet: { ...c.fleet, clockMs: 50, idleLimit: 10_000, node: { name: 'node-1', slots: 1 } } });
    const a = await player('하나');
    const b = await player('둘');
    const gate = (await post('/enter', { token: a.token })).body['gate'] as string;
    const w = await post('/enter', { token: b.token });
    expect(w).toEqual({ code: 200, body: { wait: 1 } });
    const held = await link(gate, a.token);
    held.ws.close(1000);
    await until(() => s.monitor.recent.some((t) => t.flow === 11 && t.step === 6), 5000);
    const e = await post('/enter', { token: b.token });
    expect(e.code).toBe(200);
    expect(e.body['gate']).toBe(gate);
    const who = (n: number) => s.monitor.recent.filter((t) => t.flow === 2 && t.step === 5)[n]!.who;
    const life = (x: string | undefined) => s.monitor.recent.filter((t) => t.who === x && t.person !== undefined).map((t) => `${t.flow}.${t.step} ${t.person}`);
    expect(life(who(0))).toEqual(['2.5 login', '3.7 pending', '9.8 active', '11.2 grace', '11.4 gone']);
    expect(life(who(1))).toEqual(['2.5 login', '3.20 queued', '11.6 pending']);
    expect(s.monitor.recent.find((t) => t.flow === 3 && t.step === 21)).toMatchObject({ end: 'wait', counts: { wait: 1 } });
    expect(s.monitor.recent.find((t) => t.flow === 3 && t.step === 20)).toMatchObject({ who: who(1), name: '둘' });
  });

  it('stop 뒤 다시 start — 사용자 표 · 배정 표가 스토리지에서 되돌아온다', async () => {
    const c = config();
    const first = await up(c);
    const a = await first.player('하나');
    await first.post('/enter', { token: a.token });
    await new Promise((r) => setTimeout(r, 100)); // 세계가 몇 박자 돈다 — now > 0 이어야 이어간다
    await first.s.stop();
    await first.s.stop(); // 두 번 불려도 한 번
    const second = await up(c);
    expect(second.s.fleet!.registry.get('main-1')?.state).toBe('stopped');
    const again = await second.player('-', a.subject);
    expect(again.account.split('.')[1]).toBe(a.account.split('.')[1]);
    expect(again.character).toEqual(a.character); // 캐릭터도 표에서
    expect((await second.post('/enter', { token: again.token })).code).toBe(200);
    expect(second.s.node!.runner.get('main-1')?.resumed).toBe(true);
  });

  it('다른 서버에서 같은 스토리지로 — 이 서버의 자리(local) 없이 표(db)와 Store(bucket)만으로 계정 · 배정 · 세계가 그대로', async () => {
    const c = config();
    const first = await up(c);
    const a = await first.player('하나');
    await first.post('/enter', { token: a.token });
    await new Promise((r) => setTimeout(r, 100));
    await first.s.stop(); // 흐름 7 의 5 — 내려간 Store 를 올렸다
    expect(first.s.monitor.recent.find((t) => t.flow === 7 && t.step === 5)).toMatchObject({ end: 'ok', unit: 'main-1' });
    // 다른 서버 — 같은 MongoDB(db/) · 같은 object storage(bucket/), 빈 local
    const other = mkdtempSync(join(tmpdir(), 'svc-other-'));
    cpSync(join(c.storage.root, 'db'), join(other, 'db'), { recursive: true });
    cpSync(join(c.storage.root, 'bucket'), join(other, 'bucket'), { recursive: true });
    const second = await up({ ...c, storage: { ...c.storage, root: other }, fleet: { ...c.fleet, viewerOut: join(other, 'viewer', 'viewer.js') } });
    expect(existsSync(join(other, 'local'))).toBe(false);
    const again = await second.player('-', a.subject);
    expect(again.account.split('.')[1]).toBe(a.account.split('.')[1]); // 같은 계정
    expect(again.character).toEqual(a.character); // 같은 캐릭터
    const entered = await second.post('/enter', { token: again.token });
    expect(entered.code).toBe(200);
    expect(second.s.node!.runner.get('main-1')?.resumed).toBe(true); // 올라간 Store 를 내려 받아 이어간다
    expect(second.s.fleet!.registry.get('main-1')?.epoch).toBe(2); // 세대가 이어진다
  });

  it('게이트웨이 — 받은 주소 하나로 붙어 호스트와 이어진다. 입장 없이 붙으면 4002. 사람은 9 의 8 에서 active, 닫으면 11 의 2 에서 grace', async () => {
    const { s, post, player } = await up();
    const a = await player('하나');
    const b = await player('둘');
    const gate = (await post('/enter', { token: a.token })).body['gate'] as string;
    const ok = await link(gate, a.token);
    expect(ok.first).toMatchObject({ step: 'Link 1', open: { bodies: [1, 2] } });
    const none = await link(gate, b.token); // 입장하지 않았다 — 세션이 없다
    expect(none.first).toEqual({ step: 'Link 1', reject: { why: '세션이 없다 — 먼저 입장' } });
    expect(await none.code).toBe(4002);
    const wrong = await link(gate, a.account); // 계정의 토큰은 게이트웨이를 지나지 못한다
    expect(await wrong.code).toBe(4002);
    ok.ws.close(1000);
    expect(await ok.code).toBe(1000);
    await until(() => s.monitor.recent.some((t) => t.flow === 11 && t.step === 2));
    const who = s.monitor.recent.find((t) => t.flow === 2 && t.step === 5 && t.who !== undefined)!.who;
    expect(s.monitor.recent.filter((t) => t.person !== undefined && t.who === who).map((t) => `${t.flow}.${t.step} ${t.person}`)).toEqual(['2.5 login', '3.7 pending', '9.8 active', '11.2 grace']);
    const run = s.monitor.recent.find((t) => t.flow === 9 && t.step === 10)!.run;
    expect(s.monitor.recent.filter((t) => t.run === run).map((t) => `${t.flow}.${t.step}.${t.end}`)).toEqual(['9.1.ok', '9.2.ok', '9.3.ok', '9.5.ok', '9.6.ok', '9.7.ok', '9.4.ok', '9.8.ok', '9.9.ok', '9.10.ok', '9.11.wait', '11.1.ok', '11.2.wait']); // 접속 하나 = run 하나 — 값을 올린 뒤(4 는 5 ~ 7 이 끝나야 끝난다) 잇는다
    // 한 사람의 입장 · 접속 · 끊김이 한 세션으로 묶이고, 캐릭터 이름이 실린다
    const session = s.monitor.recent.find((t) => t.flow === 3 && t.step === 7 && t.who === who)!.session!;
    expect(session).toMatch(/^s[0-9a-f]{8}$/);
    expect(s.monitor.recent.filter((t) => t.who === who && t.session !== undefined).map((t) => `${t.flow}.${t.step} ${t.session === session} ${t.name}`)).toEqual(['3.7 true 하나', '3.8 true 하나', '9.3 true 하나', '9.4 true 하나', '9.8 true 하나', '9.9 true 하나', '11.2 true 하나']);
  });

  it('Monitor.trace — 흐름 1 · 2 · 8 · 3 · 7 의 단계가 차례로 흔적을 남긴다. 한 입장은 run 하나로 Api · 세션 · 함대를 잇는다', async () => {
    const { s, post, player } = await up();
    const steps = (flow: number, run?: string) => s.monitor.recent.filter((t) => t.flow === flow && (run === undefined || t.run === run)).map((t) => `${t.step}.${t.end}`);
    expect(steps(1)).toEqual(['1.ok', '7.ok', '8.ok', '9.ok', '10.ok', '11.ok', '4.wait', '5.ok', '2.ok', '6.ok', '3.wait']); // 스토리지 · 노드(7 ~ 10 → 컨트롤 플레인의 11) · 게이트웨이(4 · 5) · API 서버(2) · 컨트롤 플레인(6) — 3(Api.listen)은 시작이 다 끝난 뒤에 남긴다
    const a = await player('하나');
    expect(steps(2)).toEqual(['1.ok', '2.ok', '3.ok', '4.ok', '5.wait']);
    expect(steps(8)).toEqual(['1.ok', '2.ok', '3.ok', '4.wait', '1.ok', '2.ok', '3.ok', '5.wait', '1.ok', '2.ok', '3.ok', '6.ok', '7.wait']); // 보기 · 만들기 · 고르기
    await post('/enter', { token: a.token });
    const run = s.monitor.recent.find((t) => t.flow === 3)!.run;
    // api(1 · 2) → control(3 ~ 6, 없으면 B 로 띄우고 6 을 다시 · 7 · 8) → api(9)
    expect(steps(3, run)).toEqual(['1.ok', '2.ok', '3.ok', '4.ok', '5.ok', '6.refused', '10.ok', '11.ok', '13.ok', '14.ok', '15.ok', '16.ok', '17.ok', '18.ok', '12.ok', '19.ok', '6.ok', '7.ok', '8.ok', '9.wait']); // 12(Runner.start)는 13 ~ 18 이 끝나야 끝난다
    expect(s.monitor.units.get('main-1')).toMatchObject({ state: 'ready' });
    await post('/enter', { token: 'nope' });
    expect(s.monitor.tally.get('3.2.refused')).toBe(1);
    const account = a.account.split('.')[1]!;
    const secrets = [a.account, a.token, a.subject, account, a.character.id];
    expect(s.monitor.recent.filter((t) => secrets.some((x) => JSON.stringify(t).includes(x)))).toEqual([]); // 토큰 · 주체 · 계정 · 캐릭터의 id 는 흔적에 없다
    // 사람은 가명으로 — 로그인 · 캐릭터 · 입장이 같은 가명, 캐릭터를 아는 단계는 이름을, 세션을 잡은 뒤는 세션을 싣는다
    const who = (flow: number, step: number) => s.monitor.recent.find((t) => t.flow === flow && t.step === step && t.who !== undefined)?.who;
    expect(who(2, 2)).toMatch(/^[0-9a-f]{8}$/);
    expect([who(8, 2), who(3, 3), who(3, 7)]).toEqual([who(2, 2), who(2, 2), who(2, 2)]);
    expect(s.monitor.recent.find((t) => t.flow === 3 && t.step === 7 && t.run === run)).toMatchObject({ name: '하나', session: expect.stringMatching(/^s/) });
    expect(s.monitor.recent.find((t) => t.flow === 3 && t.step === 2 && t.end === 'refused')!.who).toBeUndefined(); // 틀린 토큰은 누군지 모른다
    // 사람의 state — 로그인의 답은 login, 세션을 잡으면 pending
    expect(s.monitor.recent.filter((t) => t.person !== undefined && t.who === who(2, 2)).map((t) => `${t.flow}.${t.step} ${t.person}`)).toEqual(['2.5 login', '3.7 pending']);
    const monitor = s.monitor;
    await s.stop();
    const stop = monitor.recent.filter((t) => t.flow === 7).map((t) => `${t.step}.${t.state ?? ''}`);
    expect(stop).toEqual(['7.', '8.', '1.closing', '4.stopping', '5.', '6.stopped', '9.', '10.', '11.']); // 게이트웨이가 알리고 닫고 · 내리고 · Store 를 올리고 · 줄을 stopped 로 · Api 를 닫고 · 스토리지를 닫는다
    expect(monitor.units.get('main-1')?.state).toBe('stopped'); // 흐름 4 의 5 — 호스트가 끝났다
  });

  it('loadConfig — 상대 경로는 파일의 자리에서, env 가 몇 칸을 덮는다', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cfg-'));
    const file = join(dir, 'service.config.json');
    const c = config();
    const { storage: _s, pageUrl: _p, gateUrl: _g, ...rest } = c;
    const fleet = c.fleet;
    writeFileSync(file, JSON.stringify({ ...rest, storageRoot: 'out/storage', leaseMs: 30000, characterHistory: 5, fleet: { ...fleet, publicHost: 'localhost', secure: false, engineDir: 'engine', viewerOut: 'out/viewer/viewer.js' } }));
    const read = loadConfig(file, { PORT: '9001', MONITOR_PORT: '9002', SERVICE_PUBLIC_HOST: 'play.test', SERVICE_SECURE: '1' });
    expect(read.storage).toEqual({ root: join(dir, 'out/storage'), mongodbUri: null, bucket: null, leaseMs: 30000, characterHistory: 5 });
    expect(read.fleet.engineDir).toBe(join(dir, 'engine'));
    expect(read.fleet.viewerOut).toBe(join(dir, 'out/viewer/viewer.js'));
    expect(read.apiPort).toBe(9001);
    expect(read.monitorPort).toBe(9002);
    expect(read.build).toBe('-'); // 곁에 engine.lock 이 없다
    expect(read.pageUrl).toBe('https://play.test:9001/play');
    expect(read.gateUrl).toBe('wss://play.test:0');
    expect(loadConfig(file, { GATE_PORT: '9003', SERVICE_GATE_URL: 'wss://play.test/gate' }).gateway.port).toBe(9003);
    expect(loadConfig(file, { SERVICE_GATE_URL: 'wss://play.test/gate' }).gateUrl).toBe('wss://play.test/gate');
    expect(loadConfig(file, { SERVICE_PAGE_URL: 'https://play.test/play' }).pageUrl).toBe('https://play.test/play');
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

/** 게이트웨이에 붙는다 — 첫 글(Link 1)과 닫힘 코드. */
function link(gate: string, token: string): Promise<{ first: Record<string, unknown>; code: Promise<number>; ws: WebSocket }> {
  return new Promise((ok) => {
    const ws = new WebSocket(gate);
    const code = new Promise<number>((r) => ws.addEventListener('close', (e) => r(e.code)));
    ws.addEventListener('open', () => ws.send(JSON.stringify({ step: 'Host 2', credential: token })));
    ws.addEventListener('message', (m) => ok({ first: JSON.parse(String(m.data)) as Record<string, unknown>, code, ws }), { once: true });
    ws.addEventListener('close', () => ok({ first: {}, code, ws }), { once: true });
  });
}
