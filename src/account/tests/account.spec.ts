// Directory.resolve · Signer.issue · Signer.verify (흐름 2 · 흐름 3 의 1).

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { DatabaseSocket, Table } from '../../protocol/storage';
import { Directory, Signer } from '..';

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

describe('Directory.resolve', () => {
  it('같은 신원은 같은 id, 다른 신원은 다른 id. 표 accounts 에 줄 하나씩, accountInfo 에 마지막으로 온 때. 다시 세워도 같다', async () => {
    const db = memory();
    let now = 100;
    const d = new Directory(db, () => now);
    const a = await d.resolve({ provider: 'guest', subject: 'x' });
    expect(a).toMatch(/^p[0-9a-f]{12}$/);
    now = 200;
    expect(await d.resolve({ provider: 'guest', subject: 'x' })).toBe(a);
    const b = await d.resolve({ provider: 'guest', subject: 'y' });
    expect(b).not.toBe(a);
    expect(Object.fromEntries(db.rows)).toEqual({ 'accounts/guest:x': a, 'accounts/guest:y': b, [`accountInfo/${a}`]: { seen: 200 }, [`accountInfo/${b}`]: { seen: 200 } });
    const again = new Directory(db); // 다른 API 서버 · 다시 띄운 서비스 — 메모리에 든 것이 없다
    expect(await again.idOf({ provider: 'guest', subject: 'x' })).toBe(a);
    expect(await again.idOf({ provider: 'guest', subject: 'z' })).toBeNull();
  });
});

describe('Signer.issue · verify', () => {
  it('낸 토큰을 푼다. 모양은 엔진의 Gate 가 푸는 것 — hkt1.<id>.<exp>.<base64url HMAC-SHA256>', () => {
    let now = 1000;
    const s = new Signer('k', 60, () => now);
    const t = s.issue('p1');
    expect(t.startsWith('hkt1.p1.1060.')).toBe(true);
    const body = 'hkt1.p1.1060';
    expect(t).toBe(`${body}.${createHmac('sha256', 'k').update(body).digest('base64url')}`);
    expect(s.verify(t)).toBe('p1');
    now = 1060;
    expect(s.verify(t)).toBeNull(); // 만료
  });

  it('다른 키 · 바꾼 id · 모양이 틀리면 null. 키가 비면 만들지 않는다', () => {
    const s = new Signer('k', 60, () => 0);
    const t = s.issue('p1');
    expect(new Signer('other', 60, () => 0).verify(t)).toBeNull();
    expect(s.verify(t.replace('p1', 'p2'))).toBeNull();
    // 끝 글자의 쓰이지 않는 비트만 바꾼 글(같은 바이트로 풀린다)도 다른 서명이다
    const last = t.at(-1)!;
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const i = alphabet.indexOf(last);
    const twin = `${t.slice(0, -1)}${alphabet[(i & ~3) | ((i + 1) & 3)]}`;
    expect(Buffer.from(twin.split('.')[3]!, 'base64url').equals(Buffer.from(t.split('.')[3]!, 'base64url'))).toBe(true);
    expect(s.verify(twin)).toBeNull();
    expect(s.verify('p1')).toBeNull();
    expect(s.verify(42)).toBeNull();
    expect(() => s.issue('a.b')).toThrow();
    expect(() => s.issue('a b')).toThrow();
    expect(() => new Signer('', 60)).toThrow(/키/);
  });
});
