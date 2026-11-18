// Elector — 활성 컨트롤 플레인이 하나임을 지킨다 (design/README.md 의 Elector, 흐름 13). 컨트롤 플레인 프로세스마다 하나 — 둘이 뜨면 하나가 활성, 하나가 대기.
// 자리는 스토리지의 LeaderLock(holder = 이 컨트롤 플레인의 내부 주소, term 은 늘기만 한다). 잡으면 표를 다시 세우고(settling), 서면 일한다(active). 늦추지 못하면 물러난다(standby).

import type { TraceFn } from '../../protocol/observe';
import type { LeaderLockSocket } from '../../protocol/storage';

export type ElectorRole = 'standby' | 'settling' | 'active';

/** Elector 가 부르는 것 — 앱이 준다. */
export interface ElectorHooks {
  /** 자리를 잡았다 — 표를 다시 읽고(흐름 13 의 3) 보고를 기다린다. 세션은 보고에서 다시 선다(5) */
  settling(term: number, run: string): Promise<void>;
  /** 표가 섰는가 — 알던 노드가 다 알렸다(6) */
  settled(): boolean;
  /** 일을 시작한다(6) */
  active(run: string): Promise<void>;
  /** 자리를 잃었다 — 표를 버리고 대기로(7) */
  standby(run: string): Promise<void>;
}

export class Elector {
  // 데이터 — lock(참조 — LeaderLock) · role · term · holder(불변, 이 컨트롤 플레인의 주소)
  readonly lock: LeaderLockSocket;
  readonly holder: string;
  role: ElectorRole = 'standby';
  term = 0;
  private readonly ttlMs: number;
  private readonly settleMs: number;
  private readonly hooks: ElectorHooks;
  private readonly trace: TraceFn;
  private readonly log: (line: string) => void;
  private since = 0;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(lock: LeaderLockSocket, holder: string, ttlMs: number, settleMs: number, hooks: ElectorHooks, trace: TraceFn, log: (line: string) => void) {
    this.lock = lock;
    this.holder = holder;
    this.ttlMs = ttlMs;
    this.settleMs = settleMs;
    this.hooks = hooks;
    this.trace = trace;
    this.log = log;
  }

  /** elect — 흐름 13. 대기면 자리를 본다(1 · 2). 활성 · settling 이면 자리를 늦추고(7), 표가 섰거나 한계가 지나면 일을 시작한다(6). */
  async elect(run: string): Promise<ElectorRole> {
    if (this.busy) return this.role;
    this.busy = true;
    try {
      if (this.role === 'standby') {
        let term: number | null = null;
        try {
          term = await this.lock.acquire(this.holder, this.ttlMs); // LeaderLock.acquire
        } catch (e) {
          this.log(`control 자리를 보지 못했다 — ${(e as Error).message}`);
        }
        this.trace({ flow: 13, step: 1, run, unit: '-', end: 'ok', state: this.role }); // Elector.elect
        this.trace({ flow: 13, step: 2, run, unit: '-', end: term === null ? 'wait' : 'ok', state: term === null ? 'standby' : 'settling', ...(term === null ? {} : { counts: { term } }) });
        if (term === null) return this.role;
        this.term = term;
        this.role = 'settling';
        this.since = Date.now();
        this.log(`control 자리를 잡았다 — term ${term} · 표를 다시 세운다`);
        await this.hooks.settling(term, run);
      } else {
        let kept = false;
        try {
          kept = await this.lock.renew(this.holder, this.term); // LeaderLock.renew
        } catch (e) {
          this.log(`control 자리를 늦추지 못했다 — ${(e as Error).message}`);
        }
        if (!kept) {
          this.trace({ flow: 13, step: 7, run, unit: '-', end: 'failed', state: 'standby', counts: { term: this.term } });
          this.log(`control 자리를 잃었다 — term ${this.term} · 대기로 물러난다`);
          this.role = 'standby';
          await this.hooks.standby(run);
          return this.role;
        }
      }
      if (this.role === 'settling' && (this.hooks.settled() || Date.now() - this.since >= this.settleMs)) {
        this.role = 'active';
        this.trace({ flow: 13, step: 6, run, unit: '-', end: 'ok', state: 'active', counts: { term: this.term } }); // Elector.elect — 일을 시작한다
        this.log(`control 활성 — term ${this.term}`);
        await this.hooks.active(run);
      }
      return this.role;
    } finally {
      this.busy = false;
    }
  }

  /** run — 간격마다 elect(자리의 만료보다 넉넉히 짧게). */
  run(fresh: () => string): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => void this.elect(fresh()), Math.max(50, Math.floor(this.ttlMs / 3)));
    this.timer.unref();
  }

  /** resign — 흐름 7 의 9. 활성이면 자리를 놓는다 — 대기가 바로 잡는다. */
  async resign(run: string): Promise<void> {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (this.role === 'standby') return;
    this.role = 'standby';
    await this.lock.resign(this.holder, this.term).catch(() => {});
    this.trace({ flow: 7, step: 9, run, unit: '-', end: 'ok', counts: { term: this.term } }); // LeaderLock.resign
  }
}
