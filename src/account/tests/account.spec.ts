// Directory.resolve · Signer.issue · Signer.verify (흐름 2 · 흐름 3 의 1).

import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { LedgerSlot, LedgerSocket } from '../../protocol/vault';
import { Directory, Signer } from '..';

const memory = (): LedgerSocket & { saved: Map<LedgerSlot, unknown> } => {
  const saved = new Map<LedgerSlot, unknown>();
  return { saved, load: (s) => saved.get(s) ?? null, save: (s, v) => void saved.set(s, structuredClone(v)) };
};

describe('Directory.resolve', () => {
  it('같은 신원은 같은 id, 다른 신원은 다른 id. 새 id 마다 Ledger.save. 되찾으면 같다', () => {
    const ledger = memory();
    const d = new Directory(ledger);
    const a = d.resolve({ provider: 'guest', subject: 'x' });
    expect(a).toMatch(/^p[0-9a-f]{12}$/);
    expect(d.resolve({ provider: 'guest', subject: 'x' })).toBe(a);
    const b = d.resolve({ provider: 'guest', subject: 'y' });
    expect(b).not.toBe(a);
    expect(ledger.saved.get('directory')).toEqual({ users: { 'guest:x': a, 'guest:y': b } });
    const again = new Directory(ledger);
    expect(again.idOf({ provider: 'guest', subject: 'x' })).toBe(a);
    expect(again.idOf({ provider: 'guest', subject: 'z' })).toBeNull();
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
