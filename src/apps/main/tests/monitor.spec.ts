// Monitor.health · metrics · page · stream · trace 와 흐름의 지도(Monitor.map) — 흐름 14.

import { request } from 'node:http';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FlowMap, StreamHead, Trace } from '../../../protocol/observe';
import { readFlow, readMap } from '../map';
import { Monitor, aliasOf } from '../monitor';

const SRC = resolve(import.meta.dirname, '..', '..', '..');
const DESIGN = resolve(SRC, '..', 'design');

let monitors: Monitor[] = [];
afterEach(async () => {
  await Promise.all(monitors.map((m) => m.close()));
  monitors = [];
});

const EMPTY: FlowMap = { nodes: [], links: [], concepts: [], flows: [] };

async function up(map: FlowMap = EMPTY, keep = 3): Promise<Monitor> {
  const m = new Monitor({ role: 'main', build: 'b1', map, traceKeep: keep, every: 60_000, key: 'k1' });
  await m.listen(0);
  monitors.push(m);
  return m;
}

/** /observe 를 열고 event 를 차례로 모은다. */
function listen(port: number): { events: { event: string; data: unknown }[]; close: () => void } {
  const events: { event: string; data: unknown }[] = [];
  let buf = '';
  const req = request({ host: 'localhost', port, path: '/observe' }, (res) => {
    res.setEncoding('utf8');
    res.on('data', (chunk: string) => {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const event = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];
        if (event !== undefined && data !== undefined) events.push({ event, data: JSON.parse(data) });
      }
    });
  });
  req.on('error', () => {});
  req.end();
  return { events, close: () => req.destroy() };
}

const until = async (cond: () => boolean, ms = 3000): Promise<void> => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('기다리다 지쳤다');
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('Monitor.map — 관측의 지도', () => {
  it('readMap 의 구조 — README 의 프로세스 넷 · 밖, 연결 여덟의 짝 · 닿는 개념, 흐름의 단계마다 개념이 사는 프로세스가 있다', () => {
    const map = readMap(DESIGN, SRC);
    expect(map.nodes.filter((n) => !n.external).map((n) => n.id)).toEqual(['api', 'gateway', 'control', 'node']);
    expect(map.nodes.filter((n) => n.external).map((n) => n.id)).toEqual(['client', 'engine', 'storage', 'operator', 'observer']);
    const link = (name: string) => map.links.find((l) => l.name === name)!;
    expect(map.links.map((l) => l.name)).toEqual(['Api', 'Link', 'SessionRpc', 'NodeRpc', 'Engine', 'Storage', 'Operator', 'Observe']);
    expect(link('Link').pairs).toEqual([['client', 'gateway'], ['gateway', 'engine']]);
    expect(link('SessionRpc').pairs).toEqual([['api', 'control'], ['gateway', 'control']]);
    expect(link('NodeRpc').pairs).toEqual([['control', 'node']]);
    expect(link('Engine')).toMatchObject({ pairs: [['node', 'engine']], touches: ['Spawner', 'Process', 'Probe', 'Console'] });
    expect(link('Storage').pairs.map(([a]) => a)).toEqual(['api', 'gateway', 'control', 'node']);
    for (const l of map.links) expect(l.pairs.length).toBeGreaterThan(0); // 방향 글의 낱말이 전부 마디로 풀린다
    const concept = (n: string) => map.concepts.find((c) => c.name === n)!;
    expect(concept('Placer')).toMatchObject({ module: 'session', processes: ['control'], built: false });
    expect(concept('Spawner')).toMatchObject({ processes: ['node', 'api'], built: true });
    expect(concept('Api').processes).toEqual(['api']);
    expect(concept('Elector').processes).toEqual(['control']);
    expect(concept('Monitor').processes).toEqual(['api', 'gateway', 'control', 'node']);
    // 흐름의 단계마다 그 개념이 표에 있다 — 관측 페이지가 단계를 놓을 수 있다
    const known = new Set(map.concepts.map((c) => c.name));
    const stray = map.flows.flatMap((f) => f.steps.filter((s) => s.concept !== null && !known.has(s.concept)).map((s) => `${f.flow}.${s.step} ${s.concept}`));
    expect(stray).toEqual([]);
    for (const l of map.links) for (const t of l.touches) expect(known.has(t)).toBe(true);
  });

  it('readMap 의 흐름 — 흐름 열넷, 표의 # 이 단계. traced 는 코드가 그 흔적을 남기는가', () => {
    const map = readMap(DESIGN, SRC);
    expect(map.flows.map((f) => f.flow)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    const enter = map.flows.find((f) => f.flow === 3)!;
    expect(enter.name).toBe('입장');
    expect(enter.steps.map((s) => s.step)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
    expect(enter.steps[0]!.section).toMatch(/^A /);
    expect(enter.steps[10]!.section).toMatch(/^B /);
    expect(enter.order).toContain('Api.enter → Signer.verify');
    const by = (who: string) => enter.steps.find((s) => s.who.startsWith(who))!;
    expect(by('Spawner.host')).toMatchObject({ concept: 'Spawner', traced: true });
    expect(by('Admission.check').traced).toBe(false);
    // 파일이 있어도 흔적이 없으면 돌지 않는 단계다 — 흐름 8 의 Api.characters
    expect(map.flows.find((f) => f.flow === 8)!.steps.find((s) => s.who.startsWith('Api.characters'))!.traced).toBe(false);
    expect(map.flows.find((f) => f.flow === 1)!.steps[1]!.role).toBe('api');
    for (const f of map.flows) expect(new Set(f.steps.map((s) => s.step)).size).toBe(f.steps.length); // # 은 흐름 안에서 겹치지 않는다
  });

  it('readFlow — `| # |` 의 표만 단계다. 다른 표 · 머리가 아닌 파일은 뺀다', () => {
    const text = ['# 흐름 9. 시험 — 한 줄의 뜻', '', '트리거: 밖.', '한 줄: 무엇.', '', '## 순서', '', '```text', 'A.go → B.stop', '```', '', '| # | 누가 | 무엇을 | 결과 |', '|---|---|---|---|', '| 1 | A.go | 간다 | |', '| 2 | B.stop | 선다 | 끝 ◇ |', '', '### 칸', '| 칸 | 뜻 |', '|---|---|', '| 1 | 아니다 |'].join('\n');
    const f = readFlow('09-test.md', text, (fl, st) => fl === 9 && st === 1)!;
    expect(f).toMatchObject({ flow: 9, name: '시험', title: '한 줄의 뜻', trigger: '밖.', line: '무엇.', order: 'A.go → B.stop' });
    expect(f.steps.map((s) => [s.step, s.who, s.concept, s.traced, s.result])).toEqual([
      [1, 'A.go', 'A', true, ''],
      [2, 'B.stop', 'B', false, '끝 ◇'],
    ]);
    expect(readFlow('x.md', '# 다른 글', () => true)).toBeNull();
  });
});

describe('Monitor — 흐름 14', () => {
  it('Monitor.health — 듣고 있으면 200, 내려가는 가운데면 503', async () => {
    const m = await up();
    const base = `http://localhost:${m.port}`;
    expect(await (await fetch(base + '/health')).text()).toBe('ok');
    m.closing = true;
    const r = await fetch(base + '/health');
    expect([r.status, await r.text()]).toEqual([503, 'closing']);
  });

  it('Monitor.trace — recent 는 상한까지, units 는 state · 수를 잇고, tally 는 (흐름, #, 끝) 마다 센다. Monitor.metrics 가 그것을 답한다', async () => {
    const m = await up(EMPTY, 3);
    m.trace({ flow: 3, step: 11, run: 'r1', unit: 'w', end: 'ok', state: 'starting', counts: { port: 3100, players: 0 } });
    m.trace({ flow: 3, step: 15, run: 'r1', unit: 'w', end: 'ok' });
    m.trace({ flow: 3, step: 19, run: 'r1', unit: 'w', end: 'ok', state: 'ready' });
    m.trace({ flow: 5, step: 1, run: 'r2', unit: 'w', end: 'ok', counts: { players: 2 } });
    m.trace({ flow: 3, step: 2, run: 'r3', unit: '-', end: 'refused' });
    expect(m.recent.map((t) => `${t.flow}.${t.step}`)).toEqual(['3.19', '5.1', '3.2']);
    const got = (await (await fetch(`http://localhost:${m.port}/metrics`)).json()) as ReturnType<Monitor['metrics']>;
    expect(got).toMatchObject({ role: 'main', build: 'b1', closing: false });
    expect(got.units).toEqual([{ unit: 'w', state: 'ready', counts: { port: 3100, players: 2 }, at: expect.any(Number) }]);
    expect(got.tally).toEqual({ '3.11.ok': 1, '3.15.ok': 1, '3.19.ok': 1, '5.1.ok': 1, '3.2.refused': 1 });
  });

  it('Monitor.stream — 첫 글은 수치와 recent, 그 뒤로 흔적이 날 때마다. 닫으면 readers 에서 빠진다', async () => {
    const m = await up();
    m.trace({ flow: 1, step: 3, run: 's', unit: '-', end: 'wait' });
    const s = listen(m.port);
    await until(() => s.events.length >= 1);
    const head = s.events[0]!;
    expect(head.event).toBe('metrics');
    expect((head.data as StreamHead).recent.map((t) => `${t.flow}.${t.step}.${t.end}`)).toEqual(['1.3.wait']);
    expect((head.data as StreamHead).metrics.role).toBe('main');
    m.trace({ flow: 2, step: 1, run: 'l', unit: '-', end: 'ok' });
    await until(() => s.events.length >= 2);
    expect(s.events[1]).toMatchObject({ event: 'trace', data: { flow: 2, step: 1, run: 'l', end: 'ok', at: expect.any(Number) } });
    expect(m.readers.size).toBe(1);
    s.close();
    await until(() => m.readers.size === 0);
  });

  it('Monitor.page — 지도를 품은 페이지 한 장(구조의 그림 · 흐름의 길). 지도의 글이 스크립트를 닫지 못한다', async () => {
    const map: FlowMap = { ...EMPTY, flows: [{ flow: 1, file: '01-x.md', name: '시작', title: '</script><b>', trigger: '', line: '', order: '', steps: [] }] };
    const m = await up(map);
    const r = await fetch(`http://localhost:${m.port}/observe/page`);
    const html = await r.text();
    expect(r.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('<svg id="map"');
    expect(html).toContain('/observe');
    expect(html).not.toContain('</script><b>');
    const json = /<script type="application\/json" id="data">(.*?)<\/script>/s.exec(html)![1]!;
    expect((JSON.parse(json) as FlowMap).flows[0]!.title).toBe('</script><b>');
  });

  it('Monitor.trace — 넘겨받은 계정은 가명(who)이 되고 남지 않는다. 같은 키 · 같은 계정은 같은 가명, 키가 다르면 다르다', async () => {
    const m = await up();
    m.trace({ flow: 3, step: 9, run: 'r', unit: '-', end: 'wait', account: 'p0123456789ab', name: '이름', session: 's1' });
    const t = m.recent.at(-1)!;
    expect(t).toMatchObject({ who: aliasOf('k1', 'p0123456789ab'), name: '이름', session: 's1' });
    expect(t.who).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.stringify(m.recent)).not.toContain('p0123456789ab');
    expect(aliasOf('k1', 'p0123456789ab')).toBe(t.who);
    expect(aliasOf('k2', 'p0123456789ab')).not.toBe(t.who);
    expect(aliasOf('k1', 'p0123456789ac')).not.toBe(t.who);
    // /metrics 에는 사람이 없다
    const metrics = await (await fetch(`http://localhost:${m.port}/metrics`)).text();
    expect(metrics).not.toContain(t.who!);
    expect(metrics).not.toContain('이름');
  });

  it('Monitor.trace — 깨진 값에도 던지지 않는다. 사람을 다루지 않는 흔적에는 사람의 칸이 없다', async () => {
    const m = await up();
    expect(() => m.trace(null as unknown as Trace)).not.toThrow();
    m.trace({ flow: 9, step: 1, run: 'x', unit: '-', end: 'ok' });
    expect(Object.keys(m.recent.at(-1)!).sort()).toEqual(['at', 'end', 'flow', 'run', 'step', 'unit']);
  });
});
