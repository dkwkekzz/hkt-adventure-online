// MongoDB 의 뒤 — Database · Leases · CharacterStore · LeaderLock 이 디렉터리의 뒤와 같은 검사(conform.ts)를 지난다.
// MONGODB_URI 가 있을 때만 돈다(replica set 이 아니어도 된다 — 트랜잭션을 쓰지 않는다). 데이터베이스는 시험마다 새 이름을 쓰고 끝에 지운다.
//   MONGODB_URI=mongodb://localhost:27017 npx vitest run src/storage/tests/mongo.spec.ts

import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { openStorage } from '..';
import { dbNameOf } from '../mongo';
import { conformDocs, scratch } from './conform';

describe('dbNameOf — URI 의 데이터베이스 이름', () => {
  it('경로가 있으면 그것, 없으면 hkt', () => {
    expect(dbNameOf('mongodb://a:1,b:2/game?replicaSet=rs0')).toBe('game');
    expect(dbNameOf('mongodb+srv://u:p@cluster.example.net/x')).toBe('x');
    expect(dbNameOf('mongodb://localhost:27017')).toBe('hkt');
    expect(dbNameOf('mongodb://localhost:27017/?replicaSet=rs0')).toBe('hkt');
  });
});

const uri = process.env['MONGODB_URI'];
describe.skipIf(uri === undefined || uri === '')('MongoDB(MONGODB_URI)', () => {
  const name = `hkt-test-${randomBytes(4).toString('hex')}`;
  const [main = '', q] = (uri ?? '').split('?');
  const at = `${main.replace(/^(mongodb(?:\+srv)?:\/\/[^/]*).*$/, '$1')}/${name}${q === undefined ? '' : `?${q}`}`;
  it('시험의 URI 는 그 데이터베이스를 가리킨다', () => expect(dbNameOf(at)).toBe(name));
  const LEASE = 300;
  const open = () => openStorage({ root: scratch('mongo'), mongodbUri: at, bucket: null, leaseMs: LEASE, characterHistory: 2 });
  afterAll(async () => {
    const { MongoClient } = await import('mongodb');
    const c = new MongoClient(at);
    await c.connect();
    await c.db(name).dropDatabase();
    await c.close();
  });
  conformDocs('MongoDB', open, LEASE);
  it('where 에 자격을 싣지 않는다', async () => {
    const s = await open();
    expect(s.where).toMatch(/^MongoDB mongodb/);
    expect(s.where).not.toMatch(/@/);
    await s.close();
  });
});
