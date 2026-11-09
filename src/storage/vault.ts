// Vault — 샤드의 Store 디렉터리를 프로세스보다 오래 사는 자리에 (design/02-roles/storage.md 의 Vault).
// 1 차는 마운트된 볼륨 하나(디렉터리 뿌리). 안을 읽지 않는다 — 디렉터리를 통째로 다룬다. root 밖의 자리는 거절한다.
//
//   <root>/shards/<Account.id>/<dataset 이름>/                  Store 자리 — 엔진이 쓴다
//   <root>/backups/<Account.id>/<dataset 이름>/<UTC 시각>/        사본
//   <root>/ledger/<slot>.json                                    서비스의 표(Ledger)

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import type { VaultSocket } from '../protocol/vault';
import { Ledger } from './ledger';

/** 데이터셋의 자리 이름 — 엔진의 storeName 과 같다: 파일 `x.json` 은 `x`, 조각 묶음 폴더 `x` 는 `x-pieces`. */
export const datasetName = (dataset: string): string => {
  const base = basename(dataset.replace(/[\\/]+$/, ''));
  return base.endsWith('.json') ? base.slice(0, -'.json'.length) : `${base}-pieces`;
};

/** 사본 이름 — UTC 시각 `YYYYMMDDTHHMMSSmmmZ`. 이름 순 = 시간 순. */
const stamp = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace('.', '');

export class Vault implements VaultSocket {
  // 데이터 — root(불변) · ledger
  readonly root: string;
  readonly ledger: Ledger;
  private readonly now: () => Date;

  constructor(root: string, now: () => Date = () => new Date()) {
    this.root = resolve(root);
    mkdirSync(this.root, { recursive: true });
    this.ledger = new Ledger(this.root);
    this.now = now;
  }

  dirOf(account: string, dataset: string): string {
    if (!/^[^\s./\\]{1,64}$/.test(account)) throw new Error(`계정의 이름이 자리가 될 수 없다 — ${account}`);
    const dir = join(this.root, 'shards', account, datasetName(dataset));
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  copy(dir: string): string {
    const backups = this.backupsOf(dir);
    let name = stamp(this.now());
    while (existsSync(join(backups, name))) name = `${name}-1`; // 같은 ms 에 둘
    mkdirSync(backups, { recursive: true });
    cpSync(dir, join(backups, name), { recursive: true });
    return name;
  }

  restore(dir: string, backup: string): void {
    const from = join(this.backupsOf(dir), backup);
    if (basename(backup) !== backup || !existsSync(from)) throw new Error(`사본이 없다 — ${backup}`);
    if (existsSync(dir)) this.copy(dir); // 기존은 사본 하나로 남긴다
    rmSync(dir, { recursive: true, force: true });
    cpSync(from, dir, { recursive: true });
  }

  list(dir: string): string[] {
    const backups = this.backupsOf(dir);
    if (!existsSync(backups)) return [];
    return readdirSync(backups).sort();
  }

  /** Store 자리 `<root>/shards/<a>/<d>` 의 사본 자리 `<root>/backups/<a>/<d>`. root 밖이거나 모양이 아니면 거절. */
  private backupsOf(dir: string): string {
    const rel = relative(join(this.root, 'shards'), resolve(dir));
    const parts = rel.split(/[\\/]/);
    if (rel === '' || isAbsolute(rel) || parts[0] === '..' || parts.length !== 2) throw new Error(`저장장치의 자리가 아니다 — ${dir}`);
    return join(this.root, 'backups', parts[0]!, parts[1]!);
  }
}
