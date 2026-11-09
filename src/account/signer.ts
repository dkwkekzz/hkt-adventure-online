// Signer — Account.id 를 서명해 토큰으로 내고 푼다 (design/02-roles/account.md 의 Signer, 흐름 2 의 3 · 흐름 3 의 1).
// 키는 엔진의 HOST_AUTH_KEY 와 같다 — 엔진의 Gate 가 같은 토큰을 같은 셈으로 푼다.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { ACCOUNT_ID } from './account';
import { TOKEN_HEAD } from './token';
import type { Token } from './token';

export class Signer {
  // 데이터 — key(불변) · ttl(불변, 초)
  readonly key: string;
  readonly ttl: number;
  private readonly now: () => number; // epoch 초

  constructor(key: string, ttl: number, now: () => number = () => Math.floor(Date.now() / 1000)) {
    if (key === '') throw new Error('서명 키가 없다');
    this.key = key;
    this.ttl = ttl;
    this.now = now;
  }

  /** issue — Account.id → Token. 만료는 지금 + ttl. */
  issue(account: string, ttl: number = this.ttl): Token {
    if (!ACCOUNT_ID.test(account)) throw new Error(`Account.id 가 될 수 없다 — ${account}`);
    const body = `${TOKEN_HEAD}.${account}.${this.now() + ttl}`;
    return `${body}.${this.sign(body).toString('base64url')}`;
  }

  /** verify — Token → Account.id 또는 null(서명 · 만료 · 모양이 틀리면). 엔진의 Gate.verify 와 같은 셈. */
  verify(token: unknown): string | null {
    if (typeof token !== 'string') return null;
    const parts = token.trim().split('.');
    if (parts.length !== 4) return null;
    const [head, id, exp, sig] = parts as [string, string, string, string];
    if (head !== TOKEN_HEAD || !ACCOUNT_ID.test(id) || !/^\d{1,12}$/.test(exp)) return null;
    const want = this.sign(`${head}.${id}.${exp}`);
    const got = Buffer.from(sig, 'base64url');
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    if (Number(exp) <= this.now()) return null;
    return id;
  }

  private sign(body: string): Buffer {
    return createHmac('sha256', this.key).update(body).digest();
  }
}
