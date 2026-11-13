// MongoDB 의 뒤 — 문서의 모양(docs.ts 의 Docs)을 MongoDB 위에 (design/02-roles/storage.md 의 「뒤」 칸).
// 표 하나 = collection 하나, 줄 하나 = document 하나 `{_id: key, value, v}`. swap 은 `{_id, v}` 를 거른 updateOne 하나 — 트랜잭션 없음.
// 스토리지의 시각은 서버의 hello.localTime. 드라이버(mongodb)는 MONGODB_URI 가 있을 때만 읽는다 — 개발의 뒤에는 런타임 의존이 없다.

import type { Doc, Docs } from './docs';

/** URI 의 데이터베이스 이름 — `mongodb://host/<이름>?…`. 없으면 hkt. */
export const dbNameOf = (uri: string): string => {
  const path = uri.replace(/^mongodb(?:\+srv)?:\/\/[^/?]*/, '');
  const name = /^\/([^/?]+)/.exec(path)?.[1];
  return name === undefined ? 'hkt' : decodeURIComponent(name);
};

interface Row {
  _id: string;
  value: unknown;
  v: number;
}

/** 줄 둘이 같은 _id 로 먼저 들어왔다 — insert 가 진 것. */
const DUPLICATE = 11000;

type Client = import('mongodb').MongoClient;
type Database = import('mongodb').Db;

export class MongoDocs implements Docs {
  private constructor(
    private readonly client: Client,
    private readonly db: Database,
  ) {}

  /** 연결하고 한 번 묻는다 — 닿지 않으면 던진다(흐름 1 의 1 이 시작을 그만둔다). */
  static async open(uri: string): Promise<MongoDocs> {
    const { MongoClient } = await import('mongodb');
    const client = new MongoClient(uri, /serverSelectionTimeoutMS=/i.test(uri) ? {} : { serverSelectionTimeoutMS: 10_000 }); // URI 에 있으면 그것
    const docs = new MongoDocs(client, client.db(dbNameOf(uri)));
    try {
      await client.connect();
      await docs.now();
    } catch (e) {
      await client.close().catch(() => {});
      throw e;
    }
    return docs;
  }

  private coll(name: string) {
    return this.db.collection<Row>(name);
  }

  async read(coll: string, key: string): Promise<Doc | null> {
    const row = await this.coll(coll).findOne({ _id: key });
    return row === null ? null : { value: row.value ?? null, v: row.v };
  }

  async write(coll: string, key: string, value: unknown): Promise<void> {
    await this.coll(coll).updateOne({ _id: key }, { $set: { value }, $inc: { v: 1 } }, { upsert: true });
  }

  async swap(coll: string, key: string, v: number | null, value: unknown): Promise<boolean> {
    if (v === null) {
      try {
        await this.coll(coll).insertOne({ _id: key, value, v: 1 });
        return true;
      } catch (e) {
        if ((e as { code?: number }).code === DUPLICATE) return false;
        throw e;
      }
    }
    const done = await this.coll(coll).updateOne({ _id: key, v }, { $set: { value, v: v + 1 } });
    return done.modifiedCount === 1;
  }

  async drop(coll: string, key: string): Promise<void> {
    await this.coll(coll).deleteOne({ _id: key });
  }

  async scan(coll: string, where?: { readonly field: string; readonly is: unknown }): Promise<[string, unknown][]> {
    const filter = where === undefined ? {} : { [`value.${where.field}`]: where.is };
    const rows = await this.coll(coll).find(filter).sort({ _id: 1 }).toArray();
    return rows.map((r) => [r._id, r.value ?? null]);
  }

  async now(): Promise<number> {
    const hello = (await this.db.command({ hello: 1 })) as { localTime?: Date };
    return hello.localTime instanceof Date ? hello.localTime.getTime() : Date.now();
  }

  close(): Promise<void> {
    return this.client.close();
  }
}
