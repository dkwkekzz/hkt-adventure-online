// Nodes — 노드의 표와 살아 있음을 든다 (design/02-roles/fleet.md 의 Nodes, 흐름 1 의 11 · 5 의 7 · 10 · 13 의 4 · 6 의 nodes · cordon · uncordon · forget).
// 노드는 메모리에 든다 — 보고로 다시 선다. 스토리지에 남는 것은 cordoned 하나(표 `nodes`).

import type { NodeHello, NodeReport } from '../protocol/node';
import type { DatabaseSocket } from '../protocol/storage';
import type { Node } from './node';

const TABLE = 'nodes';

export class Nodes {
  // 데이터 — rows · db(참조 — 표 `nodes`: 이름 → {cordoned}) · limitMs(설정의 reportLimitMs)
  readonly rows = new Map<string, Node>();
  readonly db: DatabaseSocket;
  readonly limitMs: number;
  private readonly cordoned: Set<string>;
  private readonly now: () => number;

  private constructor(db: DatabaseSocket, limitMs: number, cordoned: Set<string>, now: () => number) {
    this.db = db;
    this.limitMs = limitMs;
    this.cordoned = cordoned;
    this.now = now;
  }

  /** 표 `nodes` 의 cordoned 를 읽는다(흐름 13 의 3). */
  static async load(db: DatabaseSocket, limitMs: number, now: () => number = Date.now): Promise<Nodes> {
    const cordoned = new Set<string>();
    for (const [name, v] of await db.all(TABLE)) if ((v as { cordoned?: unknown } | null)?.cordoned === true) cordoned.add(name);
    return new Nodes(db, limitMs, cordoned, now);
  }

  /** reload — 표 `nodes` 의 cordoned 를 다시 읽는다(흐름 13 의 3). 노드는 메모리의 것 — 대기로 물러날 때 비웠고, 새 활성에는 보고가 다시 적는다(4). */
  async reload(): Promise<void> {
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

  /** heartbeat — 보고가 온 때와 그 보고를 적는다. 모르는 노드면 알림(hello)으로 적는다. */
  heartbeat(report: NodeReport): Node {
    const node = this.rows.get(report.name) ?? this.register(report.hello);
    node.seen = this.now();
    node.closing = report.closing;
    node.report = report;
    return node;
  }

  /** dead — 보고가 한계를 넘겨 끊긴 노드들. 표에서 뺀다(다시 알리면 다시 선다). */
  dead(): Node[] {
    const before = this.now() - this.limitMs;
    const out = [...this.rows.values()].filter((n) => n.seen < before);
    for (const n of out) this.rows.delete(n.name);
    return out;
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
