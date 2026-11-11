// Monitor.health · metrics · page · stream · trace 와 흐름의 지도(Monitor.map) — 흐름 14.

import { request } from 'node:http';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { FlowMap, StreamHead, Trace } from '../../../protocol/observe';
import { readFlow, readMap } from '../map';
import { Monitor } from '../monitor';

const SRC = resolve(import.meta.dirname, '..', '..', '..');
const DESIGN = resolve(SRC, '..', 'design');

let monitors: Monitor[] = [];
afterEach(async () => {
  await Promise.all(monitors.map((m) => m.close()));
  monitors = [];
});

async function up(map: FlowMap = { flows: [] }, keep = 3): Promise<Monitor> {
  const m = new Monitor({ role: 'main', build: 'b1', map, traceKeep: keep, every: 60_000 });
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

describe('Monitor.map — 흐름의 지도', () => {
  it('readMap — design/01-flows 의 흐름 열넷, 표의 # 이 단계. 누가 칸의 개념이 src 에 섰으면 built', () => {
    const map = readMap(DESIGN, SRC);
    expect(map.flows.map((f) => f.flow)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    const enter = map.flows.find((f) => f.flow === 3)!;
    expect(enter.name).toBe('입장');
    expect(enter.steps.map((s) => s.step)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
    expect(enter.steps[0]!.section).toMatch(/^A /);
    expect(enter.steps[10]!.section).toMatch(/^B /);
    expect(enter.order).toContain('Api.enter → Signer.verify');
    const by = (who: string) => enter.steps.find((s) => s.who.startsWith(who))!;
    expect(by('Spawner.host').built).toBe(true);
    expect(by('Signer.verify').built).toBe(true);
    expect(by('Registry.put').built).toBe(false);
    expect(map.flows.find((f) => f.flow === 1)!.steps[1]!.role).toBe('api');
    for (const f of map.flows) expect(new Set(f.steps.map((s) => s.step)).size).toBe(f.steps.length); // # 은 흐름 안에서 겹치지 않는다
  });

  it('readFlow — `| # |` 의 표만 단계다. 다른 표 · 머리가 아닌 파일은 뺀다', () => {
    const text = ['# 흐름 9. 시험 — 한 줄의 뜻', '', '트리거: 밖.', '한 줄: 무엇.', '', '## 순서', '', '```text', 'A.go → B.stop', '```', '', '| # | 누가 | 무엇을 | 결과 |', '|---|---|---|---|', '| 1 | A.go | 간다 | |', '| 2 | B.stop | 선다 | 끝 ◇ |', '', '### 칸', '| 칸 | 뜻 |', '|---|---|', '| 1 | 아니다 |'].join('\n');
    const f = readFlow('09-test.md', text, (c) => c === 'A')!;
    expect(f).toMatchObject({ flow: 9, name: '시험', title: '한 줄의 뜻', trigger: '밖.', line: '무엇.', order: 'A.go → B.stop' });
    expect(f.steps.map((s) => [s.step, s.who, s.built, s.result])).toEqual([
      [1, 'A.go', true, ''],
      [2, 'B.stop', false, '끝 ◇'],
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
    const m = await up({ flows: [] }, 3);
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

  it('Monitor.page — 지도를 품은 페이지 한 장. 지도의 글이 스크립트를 닫지 못한다', async () => {
    const map: FlowMap = { flows: [{ flow: 1, file: '01-x.md', name: '시작', title: '</script><b>', trigger: '', line: '', order: '', steps: [] }] };
    const m = await up(map);
    const r = await fetch(`http://localhost:${m.port}/observe/page`);
    const html = await r.text();
    expect(r.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('id="map"');
    expect(html).toContain('/observe');
    expect(html).not.toContain('</script><b>');
    const json = /<script type="application\/json" id="map">(.*?)<\/script>/s.exec(html)![1]!;
    expect((JSON.parse(json) as FlowMap).flows[0]!.title).toBe('</script><b>');
  });

  it('Monitor.trace — 흔적이 계정 · 토큰을 싣지 않는다(칸이 없다), 깨진 값에도 던지지 않는다', async () => {
    const m = await up();
    expect(() => m.trace(null as unknown as Trace)).not.toThrow();
    m.trace({ flow: 9, step: 1, run: 'x', unit: '-', end: 'ok' });
    expect(Object.keys(m.recent.at(-1)!).sort()).toEqual(['at', 'end', 'flow', 'run', 'step', 'unit']);
  });
});
