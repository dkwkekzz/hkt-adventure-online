// Sessions — 세션을 들고 슬롯을 센다 (design/02-roles/session.md 의 Sessions, 흐름 3 의 4 · 7 · 9 의 3 · 8 · 11 의 2 · 4 · 5 의 13).
// 스토리지에 두지 않는다 — 컨트롤 플레인이 바뀌면 보고로 다시 선다(Reconciler — plan 07 · 08).

import { randomBytes } from 'node:crypto';
import type { Session } from './session';

export class Sessions {
  // 데이터 — rows
  readonly rows = new Map<string, Session>();
  private readonly pendingMs: number;
  private readonly graceMs: number;
  private readonly now: () => number;

  constructor(pendingMs: number, graceMs: number, now: () => number = Date.now) {
    this.pendingMs = pendingMs;
    this.graceMs = graceMs;
    this.now = now;
  }

  get(character: string): Session | null {
    return this.rows.get(character) ?? null;
  }

  /** held — 그 계정의 세션들(한 계정은 한때에 하나 — Admission 이 지킨다). */
  held(account: string): Session[] {
    return [...this.rows.values()].filter((s) => s.account === account);
  }

  /** hold — 세션을 pending 으로 잡는다. 만료는 pendingMs 뒤. */
  hold(character: string, account: string, name: string, instance: string, build: string): Session {
    const s: Session = { id: `s${randomBytes(4).toString('hex')}`, character, account, name, build, instance, to: null, gate: null, state: 'pending', until: this.now() + this.pendingMs };
    this.rows.set(character, s);
    return s;
  }

  /** activate — active 로, 그 게이트웨이를 적는다. 세션이 없으면 null. */
  activate(character: string, gate: string): Session | null {
    const s = this.rows.get(character);
    if (s === undefined) return null;
    s.state = 'active';
    s.gate = gate;
    s.until = 0;
    return s;
  }

  /** suspend — grace 로, 만료는 graceMs 뒤. 그 게이트웨이의 active 만 — 다른 게이트웨이로 옮겨 간 뒤의 늦은 닫힘은 받지 않는다. */
  suspend(character: string, gate: string): Session | null {
    const s = this.rows.get(character);
    if (s === undefined || s.state !== 'active' || s.gate !== gate) return null;
    s.state = 'grace';
    s.until = this.now() + this.graceMs;
    return s;
  }

  drop(character: string): Session | null {
    const s = this.rows.get(character) ?? null;
    this.rows.delete(character);
    return s;
  }

  of(instance: string): Session[] {
    return [...this.rows.values()].filter((s) => s.instance === instance || s.to === instance);
  }

  /** count — 그 인스턴스에 잡힌 슬롯(옮겨 오려고 잡아 둔 것 포함). */
  count(instance: string): number {
    return this.of(instance).length;
  }

  /** expired — pending · grace 인 채 만료된 것들. */
  expired(): Session[] {
    const now = this.now();
    return [...this.rows.values()].filter((s) => s.state !== 'active' && s.until <= now);
  }
}
