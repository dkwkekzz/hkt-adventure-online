// Vault.dirOf · copy · restore · list · Ledger.load · save — 자리를 내고 베끼고 되돌린 디렉터리 (흐름 3 의 3 · 흐름 5 의 4 · 흐름 6 의 5).

import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { datasetName, Vault } from '../vault';
import { openVault } from '..';

const root = () => mkdtempSync(join(tmpdir(), 'vault-'));

describe('Vault', () => {
  it('dirOf — <root>/shards/<계정>/<데이터셋 이름>. 이름은 엔진의 storeName 과 같다', () => {
    const r = root();
    const v = new Vault(r);
    const dir = v.dirOf('p1', 'dataset/x.json');
    expect(dir).toBe(join(r, 'shards', 'p1', 'x'));
    expect(existsSync(dir)).toBe(true);
    expect(datasetName('dataset/x')).toBe('x-pieces');
    expect(() => v.dirOf('a.b', 'x.json')).toThrow(/자리/);
    expect(() => v.dirOf('../up', 'x.json')).toThrow(/자리/);
  });

  it('copy · list · restore — 통째로 베끼고, 되돌리면 기존은 사본 하나로 남는다', () => {
    let t = 0;
    const v = new Vault(root(), () => new Date(Date.UTC(2026, 10, 9, 0, 0, t++)));
    const dir = v.dirOf('p1', 'x.json');
    writeFileSync(join(dir, 'snapshot.json'), '{"now":1}\n');
    const first = v.copy(dir);
    expect(first).toBe('20261109T000000000Z');
    writeFileSync(join(dir, 'snapshot.json'), '{"now":2}\n');
    expect(v.list(dir)).toEqual([first]);
    v.restore(dir, first);
    expect(readFileSync(join(dir, 'snapshot.json'), 'utf8')).toBe('{"now":1}\n');
    const all = v.list(dir);
    expect(all).toHaveLength(2); // 첫 사본 + 되돌리기 전의 것
    expect(readFileSync(join(v.root, 'backups', 'p1', 'x', all[1]!, 'snapshot.json'), 'utf8')).toBe('{"now":2}\n');
    expect(() => v.restore(dir, 'nope')).toThrow(/사본이 없다/);
    expect(() => v.restore(dir, '../x')).toThrow(/사본이 없다/);
    expect(() => v.copy(join(v.root, 'ledger'))).toThrow(/자리가 아니다/);
  });

  it('Ledger — 없으면 null, save 는 통째. 옆 파일이 남지 않는다', () => {
    const v = openVault(root());
    expect(v.ledger.load('directory')).toBeNull();
    v.ledger.save('directory', { users: { 'guest:a': 'p1' } });
    expect(v.ledger.load('directory')).toEqual({ users: { 'guest:a': 'p1' } });
    expect(readdirSync(join((v as Vault).root, 'ledger'))).toEqual(['directory.json']);
  });
});
