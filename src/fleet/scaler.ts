// Scaler — 존마다 예비 용량을 맞춘다 (design/02-roles/fleet.md 의 Scaler, 흐름 5 의 12).
// 정하기만 한다 — 띄우는 것(흐름 3 의 B)과 내리는 것(흐름 7 의 3 ~ 6)은 Fleet 이 그 길로 한다.

import type { ZoneSpec } from '../protocol/session';
import type { Registry } from './registry';

export interface Balance {
  /** 하나씩 띄울 존들 */
  readonly launch: readonly string[];
  /** 내릴 인스턴스들 — 까닭과 함께 */
  readonly stop: readonly { readonly name: string; readonly why: 'idle' | 'drained' }[];
}

export class Scaler {
  // 데이터 — registry(참조) · count(인스턴스 → 잡힌 슬롯 — 세션 모듈의 기능, 앱이 준다) · zones(설정) · idleLimit(설정)
  readonly registry: Registry;
  readonly zones: readonly ZoneSpec[];
  readonly idleLimit: number;
  private readonly count: (instance: string) => number;

  constructor(registry: Registry, count: (instance: string) => number, zones: readonly ZoneSpec[], idleLimit: number) {
    this.registry = registry;
    this.count = count;
    this.zones = zones;
    this.idleLimit = idleLimit;
  }

  /**
   * balance — 존마다 빈 슬롯의 합이 spare 보다 작으면 하나 띄우게 하고(뜨는 가운데가 있으면 기다린다), 사람 없이 오래(idleLimit) 쉬었고 내려도 예비 용량이 남는
   * 인스턴스와 다 비운 인스턴스는 내리게 한다. idle 은 그 인스턴스가 사람 없이 지난 Clock 의 수.
   */
  balance(idle: (instance: string) => number): Balance {
    const launch: string[] = [];
    const stop: { name: string; why: 'idle' | 'drained' }[] = [];
    for (const zone of this.zones) {
      const mine = this.registry.all().filter((i) => i.zone === zone.name);
      for (const i of mine) if (i.state === 'ready' && i.draining && this.count(i.name) === 0) stop.push({ name: i.name, why: 'drained' });
      const open = mine.filter((i) => i.state === 'ready' && !i.draining);
      let free = open.reduce((n, i) => n + Math.max(0, zone.capacity - this.count(i.name)), 0);
      if (free < zone.spare && !mine.some((i) => i.state === 'starting')) launch.push(zone.name);
      for (const i of open) {
        if (this.count(i.name) > 0 || idle(i.name) < this.idleLimit || free - zone.capacity < zone.spare) continue;
        free -= zone.capacity;
        stop.push({ name: i.name, why: 'idle' });
      }
    }
    return { launch, stop };
  }
}
