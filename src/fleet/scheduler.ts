// Scheduler — 새 인스턴스를 띄울 노드를 고른다 (design/02-roles/fleet.md 의 Scheduler, 흐름 3 의 10 · 12 의 6).
// 그 빌드를 들고 slots 에 여유가 있고 cordoned · closing 이 아닌 노드 가운데 가장 빈 것. 이름은 그 존의 내려가 있는 이름, 없으면 빈 번호.

import type { Instance } from './instance';
import { numberOf } from './instance';
import type { Nodes } from './nodes';
import type { Registry } from './registry';

/** 슬롯을 차지하는 state — 떠 있거나 뜨거나 내리는 가운데. */
const HOLDS: readonly Instance['state'][] = ['starting', 'ready', 'stopping'];

export class Scheduler {
  // 데이터 — nodes(참조) · registry(참조) · restartLimit(설정)
  readonly nodes: Nodes;
  readonly registry: Registry;
  readonly restartLimit: number;

  constructor(nodes: Nodes, registry: Registry, restartLimit: number) {
    this.nodes = nodes;
    this.registry = registry;
    this.restartLimit = restartLimit;
  }

  /** 그 노드에 떠 있는(뜨는 · 내리는) 인스턴스의 수. */
  used(node: string): number {
    return this.registry.all().filter((i) => i.node === node && HOLDS.includes(i.state)).length;
  }

  /**
   * place — 그 빌드를 들고 slots 에 여유가 있는 노드 하나와 그 존의 인스턴스 이름. 없으면 null.
   * 이름은 내려가 있는 것(stopped, 또는 셈이 한계 안인 failed) 가운데 번호가 가장 작은 것 — Store 를 이어 간다. 없으면 빈 번호.
   * want 가 있으면 그 이름만(흐름 12 의 6 — 같은 이름으로 다시 띄운다). 셈이 한계를 넘은 인스턴스가 있는 존은 운영자가 볼 때까지 띄우지 않는다.
   */
  place(zone: string, build: string, want: string | null = null): { readonly node: string; readonly name: string } | null {
    const nodes = this.nodes.live().filter((n) => n.build === build && !n.cordoned && !n.closing && this.used(n.name) < n.slots);
    if (nodes.length === 0) return null;
    const node = nodes.sort((a, b) => this.used(a.name) / a.slots - this.used(b.name) / b.slots)[0]!.name;
    if (this.registry.all().some((i) => i.zone === zone && i.state === 'failed' && i.restarts > this.restartLimit)) return null;
    const down = (i: Instance): boolean => i.state === 'stopped' || (i.state === 'failed' && i.restarts <= this.restartLimit);
    if (want !== null) {
      const i = this.registry.get(want);
      return i !== null && i.zone === zone && down(i) ? { node, name: want } : null;
    }
    const mine = this.registry.all().filter((i) => i.zone === zone);
    const reuse = mine.filter(down).sort((a, b) => (numberOf(zone, a.name) ?? 0) - (numberOf(zone, b.name) ?? 0))[0];
    if (reuse !== undefined) return { node, name: reuse.name };
    const taken = new Set(mine.map((i) => numberOf(zone, i.name)));
    let n = 1;
    while (taken.has(n)) n++;
    return { node, name: `${zone}-${n}` };
  }
}
