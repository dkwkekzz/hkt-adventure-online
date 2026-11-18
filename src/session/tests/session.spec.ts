// Admission.check · Sessions.get · ZoneMap.zoneOf · Placer.pick · Sessions.hold · Gates.pick · Queue.push · Queue.position (흐름 3 의 A · C)
// Sessions.get · Sessions.activate · Sessions.suspend (흐름 9 · 11) · Gates.seen · Gates.dead · Sessions.expired · Queue.next (흐름 5 · 11)
// Sessions.get · ZoneMap.forget (흐름 8 의 지우기) — openSession 이 낸 소켓으로. 다른 모듈의 기능은 가짜 함수.

import { afterEach, describe, expect, it } from 'vitest';
import type { TraceInput } from '../../protocol/observe';
import type { SessionOptions, SessionSocket } from '../../protocol/session';
import type { CharacterStoreSocket, DatabaseSocket, Table } from '../../protocol/storage';
import { openSession } from '..';
import { Gates } from '../gates';
import { Placer } from '../placer';
import { Queue } from '../queue';
import { Sessions } from '../sessions';

const memory = (): DatabaseSocket & { rows: Map<string, unknown> } => {
  const rows = new Map<string, unknown>();
  const k = (t: Table, key: string) => `${t}/${key}`;
  return {
    rows,
    get: async (t, key) => structuredClone(rows.get(k(t, key)) ?? null),
    put: async (t, key, v) => void rows.set(k(t, key), structuredClone(v)),
    remove: async (t, key) => void rows.delete(k(t, key)),
    all: async (t) => [...rows].filter(([x]) => x.startsWith(`${t}/`)).map(([x, v]) => [x.slice(t.length + 1), v]),
  };
};

const until = async (cond: () => boolean, ms = 3000): Promise<void> => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('기다리다 지쳤다');
    await new Promise((r) => setTimeout(r, 5));
  }
};

let opened: SessionSocket[] = [];
afterEach(() => {
  for (const s of opened) s.close();
  opened = [];
});

/** 캐릭터 셋 — p1 · p2 는 계정 a1 의 것, p3 은 a2, p4 는 a3. 세계는 launch 가 세운다 — main 존은 인스턴스 main(과 more 로 더한 것), meadow 존은 meadow-1. */
async function up(over: Partial<SessionOptions['config']> & { capacity?: number } = {}, clockMs = 60_000) {
  const { capacity = 2, ...config } = over;
  const db = memory();
  const traces: TraceInput[] = [];
  const kicked: string[] = [];
  const launched: string[] = [];
  const removed: string[] = [];
  const erased: string[] = [];
  const owners: Record<string, { account: string; name: string }> = { p1: { account: 'a1', name: '하나' }, p2: { account: 'a1', name: '둘' }, p3: { account: 'a2', name: '셋' }, p4: { account: 'a3', name: '넷' } };
  const banned = new Set<string>();
  let up_ = false;
  let room = true; // 띄울 곳이 있는가
  const more: string[] = []; // main 존의 다른 인스턴스
  let meadow = false;
  const loaded: string[] = []; // `<인스턴스> <캐릭터>[ <공간>]` — 지금 올라 있는 것
  const loads: string[] = [];
  const unloads: string[] = [];
  const rerouted: string[] = [];
  const fail = { load: null as string | null, unload: null as string | null };
  const live = (zone: string): string[] => (zone === 'main' ? [...(up_ ? ['main'] : []), ...more] : zone === 'meadow' && meadow ? ['meadow-1'] : []);
  let t = 1000;
  const characters: CharacterStoreSocket = {
    read: async () => false,
    write: async () => true,
    erase: async (c) => (erased.push(c), true),
    versions: async () => [],
    rollback: async () => false,
  };
  const session = await openSession({
    config: { pendingMs: 1000, graceMs: 1000, gateLimitMs: 1000, queueForgetMs: 5000, ...config },
    zones: [
      { name: 'main', dataset: 'dataset/world.json', capacity, spare: 0 },
      { name: 'meadow', dataset: 'dataset/meadow.json', capacity, spare: 0 },
    ],
    entry: 'main',
    clockMs,
    database: db,
    characters,
    owner: async (c) => owners[c] ?? null,
    banned: async (a) => banned.has(a),
    remove: async (c) => void removed.push(c),
    ready: (zone) => live(zone).map((name) => ({ name, build: 'b1' })),
    launch: async (zone, build, run) => {
      launched.push(`${zone} ${build} ${run}`);
      if (!room) return false;
      if (zone === 'meadow' && !meadow) return (meadow = true);
      if (zone !== 'main' || up_) return false;
      up_ = true;
      return true;
    },
    address: (i) => (live('main').includes(i) || live('meadow').includes(i) ? `ws://node/${i}` : null),
    load: async (instance, c, spot) => {
      loads.push(`${instance} ${c}${spot === null ? '' : ` ${spot}`}`);
      if (fail.load !== null && instance.startsWith(fail.load)) return '호스트가 로드하지 않았다';
      loaded.push(`${instance} ${c}`);
      return null;
    },
    unload: async (instance, c) => {
      unloads.push(`${instance} ${c}`);
      const i = loaded.indexOf(`${instance} ${c}`);
      if (i >= 0) loaded.splice(i, 1);
      return fail.unload;
    },
    reroute: (gate, c, to) => void rerouted.push(`${gate} ${c} ${to.instance} ${to.address} ${to.token}`),
    issue: (c) => `host-${c}`,
    kick: (gate, c, code) => void kicked.push(`${gate} ${c} ${code}`),
    trace: (x) => void traces.push(x),
    log: () => {},
    now: () => t,
  });
  opened.push(session);
  const report = (closing = false) => session.report({ name: 'gate-1', address: 'ws://gate.test', closing, connections: [] }, 'rep');
  return {
    session,
    db,
    traces,
    kicked,
    launched,
    removed,
    erased,
    banned,
    report,
    setRoom: (v: boolean) => (room = v),
    more,
    loaded,
    loads,
    unloads,
    rerouted,
    fail,
    down: () => (up_ = false),
    tick: (ms: number) => (t += ms),
    people: (account: string) => traces.filter((x) => x.account === account && x.person !== undefined).map((x) => `${x.flow}.${x.step} ${x.person}`),
  };
}

describe('Admission.check — 흐름 3 의 3', () => {
  it('줄이 없으면 · 차단됐으면 거절. 차단의 거절은 그 사람(계정 · 이름)의 흔적이다', async () => {
    const { session, banned, report, traces } = await up();
    report();
    expect(await session.enter('p9', 'b1', 'r0')).toEqual({ why: '캐릭터가 없다 — 캐릭터를 다시 고른다' });
    banned.add('a2');
    expect(await session.enter('p3', 'b1', 'r1')).toEqual({ why: '차단된 계정이다' });
    expect(traces.find((x) => x.run === 'r1' && x.flow === 3 && x.step === 3)).toMatchObject({ end: 'refused', account: 'a2', name: '셋' });
  });

  it('한 계정은 한때에 캐릭터 하나 — 나중 입장이 이긴다. 앞의 세션을 지우고 그 게이트웨이에 4000 으로 닫게 한다', async () => {
    const { session, report, kicked } = await up();
    report();
    expect(await session.enter('p1', 'b1', 'r1')).toEqual({ gate: 'ws://gate.test' });
    await session.attach('p1', 'gate-1', 'c1');
    expect(await session.enter('p2', 'b1', 'r2')).toEqual({ gate: 'ws://gate.test' });
    expect(kicked).toEqual(['gate-1 p1 4000']);
    expect(await session.attach('p1', 'gate-1', 'c2')).toEqual({ why: '세션이 없다 — 먼저 입장' }); // 앞의 캐릭터는 세션이 없다
    expect(await session.attach('p2', 'gate-1', 'c3')).toMatchObject({ instance: 'main' });
  });
});

describe('Sessions.hold · Placer.pick · Gates.pick — 흐름 3 의 4 ~ 8', () => {
  it('세계가 없으면 띄우고(B) 다시 고른다. 게이트웨이가 알리기 전에는 잠시 뒤 다시(busy). 다시 오면 같은 세션', async () => {
    const { session, report, launched, traces } = await up();
    expect(await session.enter('p3', 'b1', 'r1')).toEqual({ why: '게이트웨이가 없다 — 잠시 뒤 다시', busy: true });
    expect(launched).toEqual(['main b1 r1']); // 흐름 3 의 B 는 같은 run
    expect(traces.filter((x) => x.run === 'r1').map((x) => `${x.step}.${x.end}`)).toEqual(['3.ok', '4.ok', '5.ok', '6.refused', '6.ok', '7.ok', '8.failed']);
    report();
    expect(await session.enter('p3', 'b1', 'r2')).toEqual({ gate: 'ws://gate.test' });
    expect(await session.enter('p3', 'b1', 'r3')).toEqual({ gate: 'ws://gate.test' });
    expect(traces.filter((x) => x.run === 'r3').map((x) => `${x.step}.${x.end}`)).toEqual(['3.ok', '4.ok', '8.ok']); // 4 — 이미 세션이 있다
    const held = traces.filter((x) => x.flow === 3 && x.step === 7);
    expect(held).toHaveLength(2); // 게이트웨이가 없어 놓은 것 하나, 잡은 것 하나
    expect(held[1]).toMatchObject({ account: 'a2', name: '셋', unit: 'main', person: 'pending', session: expect.stringMatching(/^s[0-9a-f]{8}$/) });
    expect(traces.find((x) => x.run === 'r3' && x.step === 8)!.session).toBe(held[1]!.session);
  });

  it('다른 빌드의 인스턴스는 고르지 않는다 — 띄울 곳도 없으면 줄에 선다', async () => {
    const { session, report } = await up();
    report();
    await session.enter('p1', 'b1', 'r1');
    expect(await session.enter('p3', 'b2', 'r2')).toEqual({ wait: 1 });
  });

  it('ZoneMap.zoneOf — 닫힌 존은 거절. 닫힘은 표 zones 에 — 다시 서도 닫혀 있다', async () => {
    const db = memory();
    await db.put('zones', 'main', { closed: true });
    const closed = await openSession(optionsLike(db));
    opened.push(closed);
    closed.report({ name: 'gate-1', address: 'ws://gate.test', closing: false, connections: [] }, 'r');
    expect(await closed.enter('p3', 'b1', 'r1')).toEqual({ why: '존이 닫혔다 — main' });
    await db.put('zones', 'main', { closed: false });
    const open = await openSession(optionsLike(db));
    opened.push(open);
    open.report({ name: 'gate-1', address: 'ws://gate.test', closing: false, connections: [] }, 'r');
    expect(await open.enter('p3', 'b1', 'r2')).toEqual({ gate: 'ws://gate.test' });
  });
});

/** 세계가 늘 떠 있는 세션 모듈 — 표만 db 의 것. */
function optionsLike(db: DatabaseSocket): SessionOptions {
  return {
    config: { pendingMs: 1000, graceMs: 1000, gateLimitMs: 1000, queueForgetMs: 5000 },
    zones: [{ name: 'main', dataset: 'd', capacity: 2, spare: 0 }],
    entry: 'main',
    clockMs: 60_000,
    database: db,
    characters: { read: async () => false, write: async () => true, erase: async () => true, versions: async () => [], rollback: async () => false },
    owner: async (c) => (c === 'p3' ? { account: 'a2', name: '셋' } : null),
    banned: async () => false,
    remove: async () => {},
    ready: () => [{ name: 'main', build: 'b1' }],
    launch: async () => false,
    address: () => 'ws://node:1',
    load: async () => null,
    unload: async () => null,
    issue: (c) => c,
    kick: () => {},
    reroute: () => {},
    trace: () => {},
    log: () => {},
  };
}

describe('Queue.push · Queue.position · Queue.next — 흐름 3 의 C · 11 의 6 · 5 의 14', () => {
  it('상한을 넘으면 줄에 서고 순번을 받는다. 다시 물으면 그 순번. 슬롯이 나면 앞사람부터 세션이 잡히고 다음 물음이 주소를 받는다', async () => {
    const { session, report, tick, traces, people } = await up({ capacity: 1 }, 20);
    report();
    expect(await session.enter('p1', 'b1', 'r1')).toEqual({ gate: 'ws://gate.test' });
    expect(await session.enter('p3', 'b1', 'r2')).toEqual({ wait: 1 });
    expect(await session.enter('p4', 'b1', 'r3')).toEqual({ wait: 2 });
    expect(await session.enter('p3', 'b1', 'r4')).toEqual({ wait: 1 }); // Queue.position — 3 의 4 에서 21 로
    expect(traces.find((x) => x.run === 'r2' && x.step === 20)).toMatchObject({ end: 'wait', account: 'a2', name: '셋', person: 'queued', counts: { wait: 1 } });
    // p1 이 붙었다가 끊긴다 — 유예가 지나면 11 의 4 ~ 6: 지우고, 마지막 존을 적고, 줄의 앞사람(p3)에게 세션을 잡는다
    await session.attach('p1', 'gate-1', 'c1');
    session.detach('p1', 'gate-1', 'c1');
    report(); // 게이트웨이는 살아 있다
    tick(1500);
    report();
    await until(() => traces.some((x) => x.flow === 11 && x.step === 6));
    expect(traces.find((x) => x.flow === 11 && x.step === 6)).toMatchObject({ account: 'a2', person: 'pending', unit: 'main' });
    expect(await session.enter('p3', 'b1', 'r5')).toEqual({ gate: 'ws://gate.test' });
    expect(await session.enter('p4', 'b1', 'r6')).toEqual({ wait: 1 });
    expect(people('a1')).toEqual(['3.7 pending', '9.8 active', '11.2 grace', '11.4 gone']);
    expect(people('a2')).toEqual(['3.20 queued', '11.6 pending']);
  });

  it('줄에서 오래 묻지 않은 사람은 빠진다(5 의 14). 한 계정에 세션 하나 — 같은 계정의 사람은 줄에서 세션을 받지 않는다', async () => {
    const { session, report, tick, traces } = await up({ capacity: 1, queueForgetMs: 500 }, 20);
    report();
    await session.enter('p3', 'b1', 'r1');
    expect(await session.enter('p4', 'b1', 'r2')).toEqual({ wait: 1 });
    tick(600);
    report();
    await until(() => traces.some((x) => x.flow === 5 && x.step === 14 && x.person === 'gone'));
    expect(await session.enter('p1', 'b1', 'r3')).toEqual({ wait: 1 }); // p4 는 빠졌다
  });
});

describe('Sessions.get · Sessions.activate · Sessions.suspend — 흐름 9 의 3 · 8 · 9 · 11 의 2', () => {
  it('세션이 없으면 거절. 있으면 호스트의 주소와 새 토큰 — active. 그 게이트웨이의 detach 만 grace 로. 유예 안에 다시 붙으면 active', async () => {
    const { session, report, traces, down } = await up();
    report();
    expect(await session.attach('p3', 'gate-1', 'c0')).toEqual({ why: '세션이 없다 — 먼저 입장' });
    await session.enter('p3', 'b1', 'r1');
    expect(await session.attach('p3', 'gate-1', 'c1')).toEqual({ instance: 'main', address: 'ws://node/main', token: 'host-p3' });
    expect(traces.filter((x) => x.run === 'c1').map((x) => `${x.flow}.${x.step}.${x.end} ${x.account} ${x.name}`)).toEqual(['9.3.ok a2 셋', '9.4.ok a2 셋', '9.8.ok a2 셋', '9.9.ok a2 셋']);
    session.detach('p3', 'gate-2', 'c1'); // 다른 게이트웨이의 늦은 닫힘
    expect(traces.some((x) => x.flow === 11)).toBe(false);
    session.detach('p3', 'gate-1', 'c1');
    expect(traces.at(-1)).toMatchObject({ flow: 11, step: 2, end: 'wait', person: 'grace' });
    expect(await session.attach('p3', 'gate-1', 'c2')).toMatchObject({ token: 'host-p3' });
    down(); // 세계가 내려갔다 — 세션을 지우고 다시 입장하게 한다
    expect(await session.attach('p3', 'gate-1', 'c3')).toEqual({ why: '인스턴스가 떠 있지 않다 — 다시 입장' });
    expect(await session.attach('p3', 'gate-1', 'c4')).toEqual({ why: '세션이 없다 — 먼저 입장' });
  });
});

describe('Gates.seen · Gates.dead · Sessions.expired — 흐름 5 의 8 · 11 · 13', () => {
  it('보고가 끊긴 게이트웨이의 active 는 grace 로. 접속하지 않은 pending 은 만료로 지운다', async () => {
    const { session, report, tick, traces, people } = await up({}, 20);
    report();
    expect(traces.find((x) => x.flow === 5 && x.step === 8)).toMatchObject({ run: 'rep', unit: '-', counts: { connections: 0, closing: 0 } }); // 게이트웨이는 인스턴스가 아니다
    await session.enter('p3', 'b1', 'r1');
    await session.attach('p3', 'gate-1', 'c1');
    await session.enter('p4', 'b1', 'r2'); // 붙지 않는다
    tick(1500); // 게이트웨이의 보고도 · p4 의 pending 도 한계를 넘었다
    await until(() => traces.some((x) => x.flow === 5 && x.step === 13));
    expect(traces.find((x) => x.flow === 5 && x.step === 11)).toMatchObject({ unit: '-', counts: { sessions: 1 } });
    expect(people('a2')).toEqual(['3.7 pending', '9.8 active', '11.2 grace']);
    expect(people('a3')).toEqual(['3.7 pending', '5.13 gone']);
    expect(traces.filter((x) => x.state !== undefined)).toEqual([]); // state 칸은 단위(인스턴스 · 게이트웨이)의 것 — 세션의 state 는 person 으로만
    expect(await session.enter('p4', 'b1', 'r3')).toEqual({ why: '게이트웨이가 없다 — 잠시 뒤 다시', busy: true }); // 살아 있는 게이트웨이가 없다
  });

  it('closing 인 게이트웨이는 고르지 않는다. 여럿이면 차례로', () => {
    let t = 0;
    const g = new Gates(1000, () => t);
    g.seen('g1', 'ws://1', false);
    g.seen('g2', 'ws://2', false);
    expect([g.pick()!.name, g.pick()!.name, g.pick()!.name]).toEqual(['g1', 'g2', 'g1']);
    g.seen('g1', 'ws://1', true);
    expect([g.pick()!.name, g.pick()!.name]).toEqual(['g2', 'g2']);
    t = 2000;
    expect(g.pick()).toBeNull();
    expect(g.dead()).toEqual(['g1', 'g2']);
    expect(g.rows.size).toBe(0);
  });
});

describe('Placer.pick · Queue — 값', () => {
  it('Placer.pick 은 같은 빌드에 자리가 있는 것 가운데 가장 찬 것', () => {
    const sessions = new Sessions(1000, 1000, () => 0);
    const placer = new Placer(sessions, () => [{ name: 'z-1', build: 'b' }, { name: 'z-2', build: 'b' }, { name: 'z-3', build: 'c' }]);
    const zone = { name: 'z', dataset: 'd', capacity: 2, spare: 0, closed: false };
    sessions.hold('p1', 'a1', 'x', 'z-2', 'b');
    expect(placer.pick(zone, 'b')).toEqual({ instance: 'z-2', count: 1 });
    sessions.hold('p2', 'a2', 'y', 'z-2', 'b');
    expect(placer.pick(zone, 'b')).toEqual({ instance: 'z-1', count: 0 });
    expect(placer.pick(zone, 'nope')).toBeNull();
  });

  it('Queue — push 는 순번(이미 서 있으면 그 순번), next 는 그 빌드의 앞사람, stale 은 오래 묻지 않은 사람', () => {
    let t = 0;
    const q = new Queue('z', () => t);
    expect([q.push('p1', 'a1', 'x', 'b'), q.push('p2', 'a2', 'y', 'c'), q.push('p3', 'a3', 'z', 'b'), q.push('p1', 'a1', 'x', 'b')]).toEqual([1, 2, 3, 1]);
    expect(q.next('c')!.character).toBe('p2');
    expect(q.position('p3')).toBe(2);
    t = 100;
    q.position('p3');
    expect(q.stale(50).map((w) => w.character)).toEqual(['p1']);
    expect(q.waiting.map((w) => w.character)).toEqual(['p3']);
  });
});

describe('Sessions.get · Characters.remove · CharacterStore.erase · ZoneMap.forget — 흐름 8 의 8 ~ 11', () => {
  it('세션이 있으면(놀고 있다) 거절. 없으면 줄 · 값 · 마지막 존을 지운다', async () => {
    const { session, report, removed, erased, db, traces, tick } = await up({}, 20);
    report();
    await session.enter('p3', 'b1', 'r1');
    expect(await session.forget('a2', 'p3', 'f1')).toEqual({ why: '놀고 있는 캐릭터다 — 접속을 끊고 유예가 지난 뒤 다시' });
    await session.attach('p3', 'gate-1', 'c1');
    session.detach('p3', 'gate-1', 'c1');
    tick(1500);
    report();
    await until(() => traces.some((x) => x.flow === 11 && x.step === 5));
    expect(await db.get('lastZone', 'p3')).toBe('main'); // 11 의 5 — 마지막 존을 적었다
    expect(await session.forget('a2', 'p3', 'f2')).toEqual({ forgot: 'p3' });
    expect([removed, erased]).toEqual([['p3'], ['p3']]);
    expect(await db.get('lastZone', 'p3')).toBeNull();
    expect(traces.filter((x) => x.run === 'f2').map((x) => `${x.flow}.${x.step}.${x.end} ${x.account}`)).toEqual(['8.8.ok a2', '8.9.ok a2', '8.10.ok a2', '8.11.ok a2']);
  });
});

describe('Loader.load(9 의 4) · Loader.unload(11 의 3 · 3 의 3) — 세션이 부르는 플릿의 기능', () => {
  it('pending 의 접속은 값을 그 인스턴스에 올린다. grace 로 돌아오면 올리지 않는다. 올리지 못하면 세션을 지우고 거절', async () => {
    const { session, report, loads, fail, traces, people } = await up();
    report();
    await session.enter('p3', 'b1', 'r1');
    await session.attach('p3', 'gate-1', 'c1');
    expect(loads).toEqual(['main p3']);
    session.detach('p3', 'gate-1', 'c1');
    await session.attach('p3', 'gate-1', 'c2'); // 유예 안 — 값이 이미 있다
    expect(loads).toEqual(['main p3']);
    fail.load = 'main';
    await session.enter('p4', 'b1', 'r2');
    expect(await session.attach('p4', 'gate-1', 'c3')).toEqual({ why: '호스트가 로드하지 않았다' });
    expect(traces.find((x) => x.run === 'c3' && x.step === 4)).toMatchObject({ end: 'refused', person: 'gone' });
    expect(people('a3')).toEqual(['3.7 pending', '9.4 gone']);
    expect(await session.attach('p4', 'gate-1', 'c4')).toEqual({ why: '세션이 없다 — 먼저 입장' });
  });

  it('유예가 지나면 값을 내려 저장한 뒤 세션을 지운다. 같은 계정의 다른 캐릭터에 내보낸 세션의 값도 내린다', async () => {
    const { session, report, tick, unloads, traces } = await up({}, 20);
    report();
    await session.enter('p3', 'b1', 'r1');
    await session.attach('p3', 'gate-1', 'c1');
    session.detach('p3', 'gate-1', 'c1');
    tick(1500);
    report();
    await until(() => traces.some((x) => x.flow === 11 && x.step === 4));
    expect(unloads).toEqual(['main p3']);
    expect(traces.filter((x) => x.flow === 11).map((x) => `${x.step}.${x.end}`)).toEqual(['2.wait', '3.ok', '4.ok', '5.ok']);

    await session.enter('p1', 'b1', 'r2');
    await session.attach('p1', 'gate-1', 'c2');
    await session.enter('p2', 'b1', 'r3'); // 같은 계정 — p1 을 내보낸다
    expect(unloads).toEqual(['main p3', 'main p1']);
  });
});

describe('Mover.move · Router.reroute — 흐름 10', () => {
  it('떠남 줄 — 갈 존에 인스턴스를 띄워 슬롯을 잡고, 내리고, 그 공간에 올리고, 세션 · 마지막 존을 옮기고, 게이트웨이에 새 주소와 토큰을 보낸다', async () => {
    const { session, report, db, loads, unloads, rerouted, loaded, launched, traces, people } = await up();
    report();
    await session.enter('p3', 'b1', 'r1');
    await session.attach('p3', 'gate-1', 'c1');
    session.handoff('main', 'p3', 'meadow@들머리', 'm1');
    await until(() => rerouted.length === 1);
    expect(launched.at(-1)).toBe('meadow b1 m1'); // 갈 존에 슬롯이 없었다 — 띄웠다(흐름 3 의 B)
    expect(unloads).toEqual(['main p3']);
    expect(loads).toEqual(['main p3', 'meadow-1 p3 들머리']);
    expect(loaded).toEqual(['meadow-1 p3']); // 값은 한때에 한 인스턴스에만
    expect(rerouted).toEqual(['gate-1 p3 meadow-1 ws://node/meadow-1 host-p3']);
    expect(await db.get('lastZone', 'p3')).toBe('meadow');
    expect(traces.filter((x) => x.run === 'm1' && x.flow === 10).map((x) => `${x.step}.${x.end}`)).toEqual(['1.ok', '2.ok', '3.ok', '4.ok', '8.ok', '9.ok', '10.ok', '11.ok']);
    expect(traces.find((x) => x.run === 'm1' && x.step === 9)).toMatchObject({ account: 'a2', name: '셋', unit: 'meadow-1' });
    expect(people('a2')).toEqual(['3.7 pending', '9.8 active']); // 옮겨도 사람의 state 는 active 그대로
    session.detach('p3', 'gate-1', 'c1');
    expect(await session.attach('p3', 'gate-1', 'c2')).toMatchObject({ instance: 'meadow-1' }); // 다시 붙어도 옮긴 곳

    session.handoff('meadow-1', 'p3', 'nowhere', 'm2'); // 모르는 존 — 제자리에
    expect(traces.find((x) => x.run === 'm2')).toMatchObject({ flow: 10, step: 1, end: 'refused' });
    session.handoff('main', 'p3', 'meadow', 'm3'); // 그 인스턴스에 없다 — 늦은 줄
    expect(traces.some((x) => x.run === 'm3')).toBe(false);
  });

  it('비움(drain) — 같은 존의 다른 인스턴스로. 내리지 못하면(저장 실패) 제자리에 다시 올리고, 갈 곳에 올리지 못해도 제자리로', async () => {
    const { session, report, more, loads, unloads, rerouted, fail } = await up({ capacity: 3 });
    report();
    await session.enter('p3', 'b1', 'r1');
    await session.attach('p3', 'gate-1', 'c1');
    await session.enter('p4', 'b1', 'r2'); // pending — 슬롯만 옮긴다
    expect(await session.drain('main', 'd0')).toBe(0); // 갈 곳이 없다 — 띄울 곳도 없다(main 은 이미 섰다)
    more.push('main-2');
    fail.unload = '값을 저장하지 못했다';
    expect(await session.drain('main', 'd1')).toBe(1); // p4 만 — p3 은 제자리
    expect(loads).toEqual(['main p3', 'main p3']); // 되돌렸다
    fail.unload = null;
    fail.load = 'main-2';
    expect(await session.drain('main', 'd2')).toBe(0);
    expect(loads.at(-1)).toBe('main p3'); // 갈 곳에 올리지 못해 제자리로
    fail.load = null;
    expect(await session.drain('main', 'd3')).toBe(1);
    expect(unloads.at(-1)).toBe('main p3');
    expect(rerouted).toEqual(['gate-1 p3 main-2 ws://node/main-2 host-p3']);
    expect(await session.attach('p4', 'gate-1', 'c2')).toMatchObject({ instance: 'main-2' }); // pending 은 옮긴 곳에서 올린다
    expect(session.count('main')).toBe(0);
    expect(session.count('main-2')).toBe(2);
  });
});

describe('Sessions.of · Mover.move — 흐름 12 의 4 · 5', () => {
  it('죽은 인스턴스의 grace 는 지우고, 나머지는 내림 없이 다른 인스턴스로. 옮길 곳이 없으면 접속을 닫는다(1001)', async () => {
    const { session, report, more, unloads, loads, kicked, rerouted, traces, setRoom, down } = await up();
    report();
    await session.enter('p3', 'b1', 'r1');
    await session.attach('p3', 'gate-1', 'c1');
    await session.enter('p1', 'b1', 'r2');
    await session.attach('p1', 'gate-1', 'c2');
    session.detach('p1', 'gate-1', 'c2'); // grace
    down(); // main 이 죽었다
    more.push('main-2');
    await session.recover('main', 'x1');
    expect(unloads).toEqual([]); // 떠나는 곳이 죽었다 — 내림이 없다
    expect(loads).toEqual(['main p3', 'main p1', 'main-2 p3']);
    expect(rerouted).toEqual(['gate-1 p3 main-2 ws://node/main-2 host-p3']);
    expect(traces.find((x) => x.run === 'x1' && x.flow === 12 && x.step === 4)).toMatchObject({ unit: 'main', counts: { sessions: 2 } });
    expect(traces.filter((x) => x.run === 'x1' && x.flow === 12 && x.step === 5).map((x) => `${x.account} ${x.person ?? '-'}`).sort()).toEqual(['a1 gone', 'a2 -']);
    expect(await session.attach('p1', 'gate-1', 'c3')).toEqual({ why: '세션이 없다 — 먼저 입장' });

    more.length = 0; // main-2 도 죽었다 — 갈 곳도 띄울 곳도 없다
    setRoom(false);
    await session.recover('main-2', 'x2');
    expect(kicked).toEqual(['gate-1 p3 1001']);
    expect(traces.find((x) => x.run === 'x2' && x.flow === 12 && x.step === 5)).toMatchObject({ end: 'failed', person: 'gone' });
    expect(session.count('main-2')).toBe(0);
  });
});
