// Ledger — 서비스의 표를 저장장치에 (design/02-roles/storage.md 의 Ledger). 값은 `<root>/ledger/<slot>.json`, JSON 통째.
// save 는 옆 파일에 쓰고 이름을 바꾼다 — 반쯤 쓴 표가 남지 않는다.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LedgerSlot, LedgerSocket } from '../protocol/vault';

export class Ledger implements LedgerSocket {
  // 데이터 — 없음. 값은 저장장치에. dir 는 Vault 가 준 자리(불변)
  readonly dir: string;

  constructor(root: string) {
    this.dir = join(root, 'ledger');
    mkdirSync(this.dir, { recursive: true });
  }

  load(slot: LedgerSlot): unknown {
    const file = join(this.dir, `${slot}.json`);
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf8')) as unknown;
  }

  save(slot: LedgerSlot, value: unknown): void {
    const file = join(this.dir, `${slot}.json`);
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
    renameSync(tmp, file);
  }
}
