// Elector.elect · LeaderLock.acquire · renew · resign (흐름 13 · 7 의 9) — 자리는 메모리의 LeaderLock(만료는 지금의 셈으로).

import { describe, expect, it } from 'vitest';
import type { TraceInput } from '../../../protocol/observe';
import type { LeaderLockSocket } from '../../../protocol/storage';
import { Elector } from '../elector';

/** 메모리의 자리 — now 를 옮겨 만료를 본다. */
function lockOf() {
  let now = 0;
  let row: { holder: string; term: number; until: number } | null = null;
  let term = 0;
  const lock: LeaderLockSocket = {
    acquire: async (holder, ttl) => {
      if (row !== null && row.until > now && row.holder !== holder) return null;
      term++;
      row = { holder, term, until: now + ttl };
      return term;
    },
    renew: async (holder, t) => {
      if (row === null || row.holder !== holder || row.term !== t || row.until <= now) return false;
      row.until = now + 1000;
      return true;
    },
    resign: async (holder, t) => {
      if (row !== null && row.holder === holder && row.term === t) row = null;
    },
    holder: async () => (row === null || row.until <= now ? null : { holder: row.holder, term: row.term }),
  };
  return { lock, pass: (ms: number) => (now += ms) };
}

function electorOf(lock: LeaderLockSocket, holder: string, traces: TraceInput[], settleMs = 60_000) {
  const said: string[] = [];
  let settled = false;
  const e = new Elector(lock, holder, 1000, settleMs, {
    settling: async (term) => void said.push(`settling ${term}`),
    settled: () => settled,
    active: async () => void said.push('active'),
    standby: async () => void said.push('standby'),
  }, (x) => void traces.push(x), () => {});
  return { e, said, settle: () => (settled = true) };
}

describe('Elector.elect — 흐름 13', () => {
  it('둘이 뜨면 하나가 자리를 잡고(1 · 2) 표가 서면 일한다(6). 다른 하나는 대기', async () => {
    const { lock } = lockOf();
    const traces: TraceInput[] = [];
    const a = electorOf(lock, 'http://a', traces);
    const b = electorOf(lock, 'http://b', traces);
    expect(await a.e.elect('r1')).toBe('settling');
    expect(await b.e.elect('r2')).toBe('standby');
    expect(await a.e.elect('r3')).toBe('settling'); // 아직 알던 노드가 다 알리지 않았다
    a.settle();
    expect(await a.e.elect('r4')).toBe('active');
    expect(a.said).toEqual(['settling 1', 'active']);
    expect(b.said).toEqual([]);
    expect(traces.filter((x) => x.flow === 13).map((x) => `${x.run} ${x.step}.${x.end}`)).toEqual(['r1 1.ok', 'r1 2.ok', 'r2 1.ok', 'r2 2.wait', 'r4 6.ok']);
  });

  it('표가 서지 않아도 한계(settleMs)가 지나면 일한다', async () => {
    const { lock } = lockOf();
    const a = electorOf(lock, 'http://a', [], 0);
    await a.e.elect('r1');
    expect(await a.e.elect('r2')).toBe('active');
  });

  it('활성이 죽어 늦추지 못하면 만료 뒤 대기가 term 을 올려 잡는다. 돌아온 옛 활성은 늦추지 못해 물러난다(7)', async () => {
    const { lock, pass } = lockOf();
    const traces: TraceInput[] = [];
    const a = electorOf(lock, 'http://a', traces, 0);
    const b = electorOf(lock, 'http://b', traces, 0);
    await a.e.elect('r1');
    await a.e.elect('r2');
    expect(a.e.role).toBe('active');
    pass(1500); // a 가 멈춘 사이 자리가 만료됐다
    expect(await b.e.elect('r3')).toBe('active'); // settleMs 0 — 잡자마자 일한다
    expect(b.e.term).toBe(2);
    expect(await a.e.elect('r4')).toBe('standby');
    expect(a.said).toEqual(['settling 1', 'active', 'standby']);
    expect(traces.find((x) => x.run === 'r4')).toMatchObject({ flow: 13, step: 7, end: 'failed', counts: { term: 1 } });
  });

  it('resign — 흐름 7 의 9. 활성이 자리를 놓으면 대기가 바로 잡는다', async () => {
    const { lock } = lockOf();
    const traces: TraceInput[] = [];
    const a = electorOf(lock, 'http://a', traces, 0);
    const b = electorOf(lock, 'http://b', traces, 0);
    await a.e.elect('r1');
    await a.e.resign('r2');
    expect(traces.find((x) => x.run === 'r2')).toMatchObject({ flow: 7, step: 9, end: 'ok' });
    expect(await b.e.elect('r3')).toBe('active'); // settleMs 0 — 잡자마자 일한다
    expect(await lock.holder()).toEqual({ holder: 'http://b', term: 2 });
  });
});
