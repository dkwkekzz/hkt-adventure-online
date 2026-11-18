// Recoverer — 죽은 인스턴스의 뒤를 수습한다 (design/02-roles/fleet.md 의 Recoverer, 흐름 12).
// 사람을 다시 배정하는 것(흐름 12 의 4 · 5)은 세션 모듈의 기능(move — 앱이 준다), 다시 띄우는 것(6)은 Fleet 의 launch(흐름 3 의 B).

import type { TraceFn } from '../protocol/observe';
import type { LeasesSocket } from '../protocol/storage';
import { holderOf } from './instance';
import type { Registry } from './registry';

export class Recoverer {
  // 데이터 — registry(참조) · leases(참조) · move(세션 모듈의 기능 — 앱이 준다) · relaunch(Fleet — 같은 이름으로 다시 띄운다) · restartLimit(설정)
  readonly registry: Registry;
  readonly leases: LeasesSocket;
  readonly restartLimit: number;
  private readonly move: (instance: string, run: string) => Promise<void>;
  private readonly relaunch: (zone: string, name: string, run: string) => Promise<boolean>;
  private readonly trace: TraceFn;
  private readonly log: (line: string) => void;

  constructor(
    registry: Registry,
    leases: LeasesSocket,
    move: (instance: string, run: string) => Promise<void>,
    relaunch: (zone: string, name: string, run: string) => Promise<boolean>,
    restartLimit: number,
    trace: TraceFn,
    log: (line: string) => void,
  ) {
    this.registry = registry;
    this.leases = leases;
    this.move = move;
    this.relaunch = relaunch;
    this.restartLimit = restartLimit;
    this.trace = trace;
    this.log = log;
  }

  /** recover — 흐름 12. 줄을 failed 로, lease 를 끊고, 사람을 다시 배정하게 하고, 한계 안이면 같은 이름으로 다시 띄운다. epoch 는 죽은 세대. */
  async recover(name: string, epoch: number, why: string, run: string): Promise<void> {
    const i = this.registry.get(name);
    if (i === null || i.epoch !== epoch) return; // 이미 다른 세대가 섰다 — 그 세대의 일이 아니다
    this.trace({ flow: 12, step: 1, run, unit: name, end: 'ok' }); // Recoverer.recover
    this.log(`${name} fleet 수습한다 — ${why}`);
    const stopping = i.state === 'stopping'; // 내리던 것 — 다시 띄우지 않는다(6)
    i.state = 'failed';
    i.port = null;
    i.restarts++;
    try {
      await this.registry.put(i);
      this.trace({ flow: 12, step: 2, run, unit: name, end: 'ok', state: 'failed', counts: { restarts: i.restarts } }); // Registry.put
    } catch {
      this.trace({ flow: 12, step: 2, run, unit: name, end: 'failed', state: 'failed', counts: { restarts: i.restarts } }); // 메모리의 줄은 failed — 다음 put 이 적는다
    }
    try {
      await this.leases.expire(holderOf(i)); // 값은 마지막으로 저장한 것이다
      this.trace({ flow: 12, step: 3, run, unit: name, end: 'ok' }); // Leases.expire
    } catch (e) {
      this.trace({ flow: 12, step: 3, run, unit: name, end: 'failed' }); // lease 는 만료로 풀린다(leaseMs)
      this.log(`${name} fleet lease 를 끊지 못했다 — ${(e as Error).message} (만료로 풀린다)`);
    }
    await this.move(name, run); // 흐름 12 의 4 · 5 — 세션 모듈이 흔적을 남긴다
    const now = this.registry.get(name);
    if (now === null || now.state !== 'failed') return; // 사람을 옮기며 이미 다시 띄웠다(흐름 3 의 B)
    if (stopping) {
      now.state = 'stopped';
      now.restarts--; // 죽은 것이 아니라 내리던 것이다
      await this.registry.put(now).catch(() => {});
      this.trace({ flow: 12, step: 6, run, unit: name, end: 'ok', state: 'stopped' }); // 내리던 것 — 다시 띄우지 않는다
      return;
    }
    if (now.restarts > this.restartLimit) {
      this.trace({ flow: 12, step: 6, run, unit: name, end: 'refused', state: 'failed', counts: { restarts: now.restarts } }); // 운영자가 본다
      this.log(`${name} fleet ${now.restarts} 번 죽었다 — failed 로 둔다(운영자: start ${now.zone})`);
      return;
    }
    try {
      const up = await this.relaunch(now.zone, name, run); // Scheduler.place ⇒ 흐름 3 의 B
      this.trace({ flow: 12, step: 6, run, unit: name, end: up ? 'ok' : 'refused' });
    } catch (e) {
      this.trace({ flow: 12, step: 6, run, unit: name, end: 'failed' });
      this.log(`${name} fleet 다시 띄우지 못했다 — ${(e as Error).message}`);
    }
  }
}
