// Nodes — 노드의 표와 살아 있음을 든다 (design/02-roles/fleet.md 의 Nodes, 흐름 1 의 11 · 5 의 7 · 10 · 13 의 4 · 6 의 nodes · cordon · uncordon · forget).
// 노드는 메모리에 든다 — 보고로 다시 선다. 스토리지에 남는 것은 cordoned 하나(표 `nodes`).
// heartbeat 는 보고와 인스턴스의 표(Registry)를 맞춰 내릴 것과 죽은 것을 준다 — 판정은 여기, 내리게 하고 수습하는 것은 부른 쪽(Fleet)이 한다.

import type { InstanceReport, NodeHello, NodeReport } from '../protocol/node';
import type { DatabaseSocket } from '../protocol/storage';
import type { Instance } from './instance';
import type { Node } from './node';
import type { Registry } from './registry';

/** 보고를 맞춘 것 — 표에 없어 내릴 인스턴스(보고의 줄), 보고에 잇달아 없어 죽은 인스턴스(표의 줄). */
export interface Matched {
  readonly node: Node;
  readonly stop: readonly InstanceReport[];
  readonly dead: readonly Instance[];
}

/** 끊긴 노드 — held 면 노드의 큰 몫이 한꺼번에 끊겨 보여 판정하지 않았다(그 노드들은 표에 둔다). */
export interface Dead {
  readonly dead: readonly Node[];
  readonly held: boolean;
  readonly of: number;
}

const TABLE = 'nodes';

export class Nodes {
  // 데이터 — rows · db(참조 — 표 `nodes`: 이름 → {cordoned}) · registry(참조) · missing(`<인스턴스>@<세대>` → 보고에 잇달아 없던 수) · limitMs(설정의 reportLimitMs)
  readonly rows = new Map<string, Node>();
  readonly db: DatabaseSocket;
  readonly registry: Registry;
  readonly limitMs: number;
  private readonly missing = new Map<string, number>();
  private readonly cordoned: Set<string>;
  private readonly now: () => number;

  private constructor(db: DatabaseSocket, registry: Registry, limitMs: number, cordoned: Set<string>, now: () => number) {
    this.db = db;
    this.registry = registry;
    this.limitMs = limitMs;
    this.cordoned = cordoned;
    this.now = now;
  }

  /** 표 `nodes` 의 cordoned 를 읽는다(흐름 13 의 3). */
  static async load(db: DatabaseSocket, registry: Registry, limitMs: number, now: () => number = Date.now): Promise<Nodes> {
    const cordoned = new Set<string>();
    for (const [name, v] of await db.all(TABLE)) if ((v as { cordoned?: unknown } | null)?.cordoned === true) cordoned.add(name);
    return new Nodes(db, registry, limitMs, cordoned, now);
  }

  /** reload — 표 `nodes` 의 cordoned 를 다시 읽는다(흐름 13 의 3). 노드는 메모리의 것 — 대기로 물러날 때 비웠고, 새 활성에는 보고가 다시 적는다(4). */
  async reload(): Promise<void> {
    this.missing.clear();
    this.cordoned.clear();
    for (const [name, v] of await this.db.all(TABLE)) if ((v as { cordoned?: unknown } | null)?.cordoned === true) this.cordoned.add(name);
    for (const n of this.rows.values()) n.cordoned = this.cordoned.has(n.name);
  }

  /** register — 노드를 적는다(이미 있으면 주소 · 빌드 · slots 를 고친다). */
  register(hello: NodeHello): Node {
    const was = this.rows.get(hello.name);
    const node: Node = was ?? { name: hello.name, address: hello.address, host: hello.host, build: hello.build, slots: hello.slots, seen: 0, cordoned: this.cordoned.has(hello.name), closing: false, report: null };
    node.address = hello.address;
    node.host = hello.host;
    node.build = hello.build;
    node.slots = hello.slots;
    node.seen = this.now();
    this.rows.set(hello.name, node);
    return node;
  }

  /**
   * heartbeat — 흐름 5 의 7. 보고가 온 때와 그 보고를 적고(모르는 노드면 알림 hello 로 적는다) 인스턴스의 표와 맞춘다.
   * 표에 없는(또는 다른 노드 · 다른 세대의) 인스턴스는 내릴 것이다. 표에서는 그 노드에서 ready 인데 보고에 잇달아 둘 없으면 죽은 것이다 —
   * 하나는 방금 띄운 것과 엇갈린 보고일 수 있다. judge 가 거짓이면(표가 서는 가운데 — 흐름 13) 적기만 한다.
   */
  heartbeat(report: NodeReport, judge = true): Matched {
    const node = this.rows.get(report.name) ?? this.register(report.hello);
    node.seen = this.now();
    node.closing = report.closing;
    node.report = report;
    if (!judge) return { node, stop: [], dead: [] };
    const stop = report.instances.filter((r) => {
      const i = this.registry.get(r.name);
      return i === null || i.node !== node.name || i.epoch !== r.epoch;
    });
    const here = new Set(report.instances.map((r) => r.name));
    const dead: Instance[] = [];
    for (const i of this.registry.all()) {
      if (i.node !== node.name) continue;
      const key = `${i.name}@${i.epoch}`;
      if (i.state !== 'ready' || here.has(i.name)) {
        this.missing.delete(key);
        continue;
      }
      const n = (this.missing.get(key) ?? 0) + 1;
      if (n < 2) {
        this.missing.set(key, n);
        continue;
      }
      this.missing.delete(key);
      dead.push(i);
    }
    return { node, stop, dead };
  }

  /**
   * dead — 흐름 5 의 10. 보고가 한계를 넘겨 끊긴 노드들 — 표에서 뺀다(다시 알리면 다시 선다).
   * 노드가 여럿인데 절반 넘게가 한꺼번에 끊겨 보이면 컨트롤 플레인 쪽 망을 의심한다 — 판정하지 않고 그 노드들을 표에 두고(지금을 마지막 보고로) held.
   */
  dead(): Dead {
    const before = this.now() - this.limitMs;
    const of = this.rows.size;
    const out = [...this.rows.values()].filter((n) => n.seen < before);
    if (out.length > 0 && of > 1 && out.length * 2 > of) {
      for (const n of out) n.seen = this.now();
      return { dead: out, held: true, of };
    }
    for (const n of out) this.rows.delete(n.name);
    return { dead: out, held: false, of };
  }

  /** clear — 흐름 13 의 7. 자리를 잃었다 — 노드는 새 활성의 보고로 다시 선다. */
  clear(): void {
    this.rows.clear();
    this.missing.clear();
  }

  /** live — 살아 있고 내려가는 가운데가 아닌 노드들. */
  live(): Node[] {
    return this.list().filter((n) => !n.closing);
  }

  async cordon(name: string): Promise<void> {
    await this.set(name, true);
  }

  async uncordon(name: string): Promise<void> {
    await this.set(name, false);
  }

  private async set(name: string, on: boolean): Promise<void> {
    await this.db.put(TABLE, name, { cordoned: on });
    if (on) this.cordoned.add(name);
    else this.cordoned.delete(name);
    const n = this.rows.get(name);
    if (n !== undefined) n.cordoned = on;
  }

  /** forget — 그 노드를 죽은 것으로 표에서 뺀다(운영자의 forget). */
  forget(name: string): Node | null {
    const n = this.rows.get(name) ?? null;
    this.rows.delete(name);
    return n;
  }

  get(name: string): Node | null {
    return this.rows.get(name) ?? null;
  }

  list(): Node[] {
    return [...this.rows.values()].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  }
}
