// Reconciler — 노드 · 게이트웨이의 보고와 세션을 맞춘다 (design/02-roles/session.md 의 Reconciler, 흐름 5 의 9 · 13 의 5).
// 진실은 노드가 든 것(로드된 캐릭터)과 게이트웨이가 든 것(접속)이다. 지우는 것은 두 번 잇달아 어긋날 때만 한다 — 방금 한 일과 엇갈린 보고에 속지 않게.
// 컨트롤 플레인이 막 바뀌어 표가 서는 가운데(rebuild)면 보고에서 세션을 다시 세운다 — 로드된 캐릭터가 세션이고, 접속이 있으면 active 다.

import type { TraceEnd, TraceInput } from '../protocol/observe';
import type { GateReport } from '../protocol/session';
import type { Router } from './router';
import type { Session } from './session';
import type { Sessions } from './sessions';

type Mark = (flow: number, step: number, run: string, end: TraceEnd, s: Session | { readonly account?: string } | null, extra?: Partial<TraceInput>) => void;

export interface ReconcilerParts {
  readonly sessions: Sessions;
  readonly router: Router;
  /** 플릿의 Loader.unload — 앱이 준다 */
  readonly unload: (instance: string, character: string, run: string) => Promise<string | null>;
  /** Characters.owner — 다시 세울 때 그 캐릭터의 계정 · 이름 */
  readonly owner: (character: string) => Promise<{ readonly account: string; readonly name: string } | null>;
  /** SessionRpc kick — 세션이 없는 접속을 닫게 한다 */
  readonly kick: (gate: string, character: string, code: number, run: string) => void;
  /** 옮기는 가운데의 캐릭터 — 맞추지 않는다(Mover.busy) */
  readonly busy: (character: string) => boolean;
  readonly mark: Mark;
  readonly log: (line: string) => void;
}

export class Reconciler {
  // 데이터 — sessions · router(참조) · unload(앱이 준다) · strikes(어긋난 수 — 두 번이면 고친다)
  readonly sessions: Sessions;
  readonly router: Router;
  readonly strikes = new Map<string, number>();
  private readonly p: ReconcilerParts;

  constructor(parts: ReconcilerParts) {
    this.p = parts;
    this.sessions = parts.sessions;
    this.router = parts.router;
  }

  /** 어긋남 하나를 센다 — 두 번째면 true 를 주고 센 것을 지운다. */
  private strike(key: string, seen: Set<string>): boolean {
    seen.add(key);
    const n = (this.strikes.get(key) ?? 0) + 1;
    if (n >= 2) {
      this.strikes.delete(key);
      return true;
    }
    this.strikes.set(key, n);
    return false;
  }

  /** 이번 보고에서 다시 어긋나지 않은 것은 센 것을 지운다. */
  private forgive(prefix: string, seen: Set<string>): void {
    for (const k of [...this.strikes.keys()]) if (k.startsWith(prefix) && !seen.has(k)) this.strikes.delete(k);
  }

  /**
   * node — 노드의 보고(인스턴스마다 로드된 캐릭터). 로드돼 있는데 세션이 없는(또는 다른 인스턴스의 세션인) 캐릭터는 언로드시키고,
   * 그 노드의 인스턴스에 세션이 있는데(active · grace) 로드돼 있지 않으면 세션을 지우고 접속을 닫게 한다. rebuild 면 로드된 캐릭터에서 세션을 세운다.
   */
  async node(node: string, instances: readonly { readonly name: string; readonly loaded: readonly string[] }[], build: (instance: string) => string, rebuild: boolean, run: string): Promise<void> {
    const p = this.p;
    const seen = new Set<string>();
    const here = new Set(instances.map((i) => i.name));
    let unloaded = 0;
    let dropped = 0;
    let adopted = 0;
    for (const i of instances) {
      for (const c of i.loaded) {
        if (p.busy(c)) continue;
        const s = this.sessions.get(c);
        if (s === null && rebuild) {
          const who = await p.owner(c).catch(() => null);
          if (who === null) continue;
          const made = this.sessions.adopt(c, who.account, who.name, i.name, build(i.name));
          adopted++;
          p.mark(13, 5, run, 'ok', made, { unit: i.name, person: 'grace' }); // Reconciler.match — 보고에서 세션을 다시 세웠다
          continue;
        }
        if (s !== null && (s.instance === i.name || s.to === i.name)) continue;
        if (!this.strike(`${node}:load:${i.name}:${c}`, seen)) continue;
        unloaded++;
        p.log(`${c} session 세션 없이 ${i.name} 에 로드돼 있다 — 내리게 한다`);
        void p.unload(i.name, c, run);
      }
    }
    for (const s of [...this.sessions.rows.values()]) {
      if (s.state === 'pending' || !here.has(s.instance) || p.busy(s.character)) continue;
      const loaded = instances.find((i) => i.name === s.instance)?.loaded.includes(s.character) === true;
      if (loaded || !this.strike(`${node}:lost:${s.character}`, seen)) continue;
      dropped++;
      this.router.kick(s, 1001, run); // 클라이언트는 다시 입장한다 — 값은 스토리지에
      this.sessions.drop(s.character);
      p.mark(5, 9, run, 'ok', s, { unit: s.instance, person: 'gone' });
    }
    this.forgive(`${node}:`, seen);
    if (unloaded + dropped + adopted > 0 || rebuild) p.mark(5, 9, run, 'ok', null, { unit: node, counts: { unloaded, dropped, adopted } }); // Reconciler.match
  }

  /**
   * gate — 게이트웨이의 보고(접속마다 캐릭터와 이어진 인스턴스). 접속이 있는데 세션이 grace 면 active 로, active 인데 그 게이트웨이에 접속이 없으면 grace 로,
   * 세션이 없는 접속은 닫게 한다(4002). rebuild 면 닫지 않는다 — 세션이 아직 서는 가운데다.
   */
  gate(report: GateReport, rebuild: boolean, run: string): void {
    const p = this.p;
    const seen = new Set<string>();
    const open = new Set(report.connections.map((c) => c.character));
    let fixed = 0;
    for (const c of report.connections) {
      if (p.busy(c.character)) continue;
      const s = this.sessions.get(c.character);
      if (s === null) {
        if (rebuild || !this.strike(`gate:${report.name}:ghost:${c.character}`, seen)) continue;
        fixed++;
        p.kick(report.name, c.character, 4002, run);
        continue;
      }
      if (s.state === 'grace' || (s.state === 'active' && s.gate !== report.name)) {
        this.sessions.activate(c.character, report.name);
        fixed++;
        p.mark(5, 9, run, 'ok', s, { unit: s.instance, person: 'active' });
      }
    }
    for (const s of [...this.sessions.rows.values()]) {
      if (s.state !== 'active' || s.gate !== report.name || open.has(s.character) || p.busy(s.character)) continue;
      if (!this.strike(`gate:${report.name}:lost:${s.character}`, seen)) continue;
      if (this.sessions.suspend(s.character, report.name) === null) continue;
      fixed++;
      p.mark(5, 9, run, 'ok', s, { unit: s.instance, person: 'grace' });
    }
    this.forgive(`gate:${report.name}:`, seen);
    if (fixed > 0) p.mark(5, 9, run, 'ok', null, { counts: { fixed } }); // Reconciler.match
  }
}
