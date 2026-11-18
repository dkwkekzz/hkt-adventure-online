// Registry — 인스턴스의 표를 든다 (design/02-roles/fleet.md 의 Registry, 흐름 3 의 11 · 19 · 7 의 6 · 12 의 2).
// 값은 Database 의 표 `instances` 에 줄 하나씩. Fleet.open 이 한 번 읽어 들고, 바꿀 때마다 그 줄을 쓴다.
// Store 의 자리는 줄에 없다 — 띄울 때마다 SnapshotStore.pull 이 이 서버의 자리를 준다.

import type { DatabaseSocket } from '../protocol/storage';
import type { Instance, InstanceState } from './instance';

const TABLE = 'instances';
const STATES: readonly InstanceState[] = ['starting', 'ready', 'stopping', 'stopped', 'failed'];

export class Registry {
  // 데이터 — db(참조 — 표 `instances`) · rows(메모리의 거울)
  readonly db: DatabaseSocket;
  readonly rows = new Map<string, Instance>();

  private constructor(db: DatabaseSocket) {
    this.db = db;
  }

  /** 표의 줄 전부를 읽어 세운다. 모양이 아닌 줄(앞 plan 의 것 — 존이 없다)은 건너뛰고 그 이름을 준다. */
  static async load(db: DatabaseSocket): Promise<{ registry: Registry; skipped: string[] }> {
    const registry = new Registry(db);
    const skipped: string[] = [];
    for (const [name, raw] of await db.all(TABLE)) {
      const r = raw as Partial<Instance> | null;
      if (r === null || typeof r.zone !== 'string' || typeof r.node !== 'string') {
        skipped.push(name);
        continue;
      }
      registry.rows.set(name, {
        name,
        zone: r.zone,
        node: r.node,
        port: typeof r.port === 'number' ? r.port : null,
        epoch: typeof r.epoch === 'number' ? r.epoch : 0,
        build: typeof r.build === 'string' ? r.build : '-',
        state: STATES.includes(r.state as InstanceState) ? (r.state as InstanceState) : 'stopped',
        draining: r.draining === true,
        restarts: typeof r.restarts === 'number' ? r.restarts : 0,
      });
    }
    return { registry, skipped };
  }

  /** reload — 표를 스토리지에서 다시 읽는다(흐름 13 의 3 — 다른 컨트롤 플레인이 고쳤을 수 있다). */
  async reload(): Promise<void> {
    const { registry } = await Registry.load(this.db);
    this.rows.clear();
    for (const [k, v] of registry.rows) this.rows.set(k, v);
  }

  all(): Instance[] {
    return [...this.rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  }

  get(name: string): Instance | null {
    return this.rows.get(name) ?? null;
  }

  /** put — 줄을 적는다. 메모리와 표 둘 다(흐름 3 의 11 · 19 · 7 의 6 · 12 의 2). */
  async put(instance: Instance): Promise<void> {
    this.rows.set(instance.name, instance);
    await this.db.put(TABLE, instance.name, { ...instance });
  }

  /** remove — 내려간 인스턴스의 줄을 지운다(흐름 6 의 remove). */
  async remove(name: string): Promise<void> {
    this.rows.delete(name);
    await this.db.remove(TABLE, name);
  }

  /** ready — 그 존의 ready 이고 비우는 가운데가 아닌 인스턴스들(Placer 가 고른다). */
  ready(zone: string): Instance[] {
    return this.all().filter((i) => i.zone === zone && i.state === 'ready' && !i.draining && i.port !== null);
  }

  /** drain — 비우는 가운데 표시를 켜고 끈다(새 세션을 받지 않는다). */
  async drain(name: string, on: boolean): Promise<Instance | null> {
    const i = this.rows.get(name);
    if (i === undefined) return null;
    i.draining = on;
    await this.put(i);
    return i;
  }
}
