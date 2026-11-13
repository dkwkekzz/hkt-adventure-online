// 스토리지 storage (design/02-roles/storage.md). 밖에 내보내는 것은 openStorage 하나 — 스토리지의 객체는 소켓(protocol/storage.ts) 너머다.
// 뒤는 둘씩: 문서는 MONGODB_URI 가 있으면 MongoDB(mongo.ts), 없으면 root 의 디렉터리(docs.ts). 물건은 SNAPSHOT_URI 가 있으면 object storage(s3.ts), 없으면 root 의 디렉터리(bucket.ts).

import type { StorageOptions, StorageSocket } from '../protocol/storage';
import { DirBucket } from './bucket';
import type { Bucket } from './bucket';
import { CharacterStore } from './character-store';
import { Database } from './database';
import { DirDocs } from './docs';
import type { Docs } from './docs';
import { LeaderLock } from './leader-lock';
import { Leases } from './leases';
import { MongoDocs } from './mongo';
import { S3Bucket } from './s3';
import { SnapshotStore } from './snapshot-store';

/** 접속 문자열에서 자격을 뺀 것 — 글에 싣는다. */
const bare = (uri: string): string => uri.replace(/^(mongodb(?:\+srv)?:\/\/)[^@/]*@/, '$1').replace(/\?.*$/, '');

/** Service.start(흐름 1 의 1) — 뒤에 닿는다. 닿지 않으면 던진다. 디렉터리의 뒤는 없으면 만든다. */
export async function openStorage(o: StorageOptions): Promise<StorageSocket> {
  const docs: Docs = o.mongodbUri === null ? new DirDocs(o.root) : await MongoDocs.open(o.mongodbUri);
  const bucket: Bucket = o.bucket === null ? new DirBucket(o.root) : new S3Bucket(o.bucket);
  const leases = new Leases(docs, o.leaseMs);
  return {
    database: new Database(docs),
    characters: new CharacterStore(docs, o.characterHistory),
    leases,
    snapshots: new SnapshotStore(o.root, bucket),
    leader: new LeaderLock(docs),
    where: `${o.mongodbUri === null ? `디렉터리 ${o.root}` : `MongoDB ${bare(o.mongodbUri)}`} · Store ${o.bucket === null ? '디렉터리' : `s3://${o.bucket.bucket}/${o.bucket.prefix}`}`,
    close: () => docs.close(),
  };
}
