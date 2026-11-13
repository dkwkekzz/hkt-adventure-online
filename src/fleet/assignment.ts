// Assignment — 세계의 자리 표: 세계의 이름 → {dataset, port, epoch} (design/02-roles/fleet.md 의 Registry 가 설 자리 — plan 07 이 가른다).
// 값은 Database 의 표 `instances` 에 줄 하나씩. Fleet.open 이 한 번 읽어 들고, 바꿀 때마다 그 줄을 쓴다.
// Store 의 자리는 줄에 없다 — 띄울 때마다 SnapshotStore.pull 이 이 서버의 자리를 준다(다른 서버에서 띄워도 같은 줄이다).

import type { DatabaseSocket } from '../protocol/storage';

export interface Row {
  readonly dataset: string;
  /** null 이면 포트를 비웠다(revoke-port) — 다음 입장이 새로 받는다. */
  port: number | null;
  /** 세대 — 띄울 때마다 하나 오른다(흐름 3 의 11). Store 를 올릴 때 낡은 세대를 거른다. */
  epoch: number;
}

const TABLE = 'instances';

export class Assignment {
  // 데이터 — rows · db(참조)
  readonly rows: Map<string, Row>;
  readonly db: DatabaseSocket;

  private constructor(db: DatabaseSocket, rows: Map<string, Row>) {
    this.db = db;
    this.rows = rows;
  }

  /** 표 `instances` 의 줄 전부를 읽어 세운다. */
  static async load(db: DatabaseSocket): Promise<Assignment> {
    const rows = new Map<string, Row>();
    for (const [name, raw] of await db.all(TABLE)) {
      const r = raw as Partial<Row> | null;
      if (r === null || typeof r.dataset !== 'string') continue;
      rows.set(name, { dataset: r.dataset, port: typeof r.port === 'number' ? r.port : null, epoch: typeof r.epoch === 'number' ? r.epoch : 0 });
    }
    return new Assignment(db, rows);
  }

  get(world: string): Row | null {
    return this.rows.get(world) ?? null;
  }

  /** 줄을 적는다 — 메모리와 표 둘 다. */
  async put(world: string, row: Row): Promise<void> {
    this.rows.set(world, row);
    await this.db.put(TABLE, world, { dataset: row.dataset, port: row.port, epoch: row.epoch } satisfies Row);
  }

  async remove(world: string): Promise<void> {
    this.rows.delete(world);
    await this.db.remove(TABLE, world);
  }

  all(): [string, Row][] {
    return [...this.rows];
  }
}
