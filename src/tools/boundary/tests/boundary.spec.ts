// 경계 검사 — 이 저장소는 어긋남 0, 규칙을 하나 어긴 나무는 그 규칙의 이름으로 찍히고 check.ts 가 1 로 끝난다 (plan stage 7).

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { check } from '../check';

const ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'bnd-'));
  for (const [p, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), text);
  }
  return root;
}

const base = {
  'src/protocol/vault.ts': 'export interface V { x: number }\n',
  'src/storage/index.ts': "import type { V } from '../protocol/vault';\nexport const openVault = (): V => ({ x: 1 });\n",
  'src/storage/vault.ts': 'export class Vault {}\n',
  'src/fleet/index.ts': 'export class Fleet { enter() {} }\n',
  'src/fleet/shard.ts': 'export class Shard {}\n',
  'src/account/index.ts': 'export class Signer { issue() {} }\n',
};

describe('경계 검사', () => {
  it('이 저장소는 어긋남 0', () => {
    expect(check(ROOT)).toEqual([]);
  });

  it('규칙마다 하나씩 어긴 나무', () => {
    const cases: [string, Record<string, string>, RegExp][] = [
      ['S', { 'src/protocol/x.ts': "import { Vault } from '../storage/vault';\n" }, /규칙 S/],
      ['A', { 'src/account/x.ts': "import { Fleet } from '../fleet';\n" }, /규칙 A/],
      ['T', { 'src/storage/x.ts': "import { Signer } from '../account';\n" }, /규칙 T/],
      ['F', { 'src/fleet/x.ts': "import { openVault } from '../storage';\n" }, /규칙 F/],
      ['P 안', { 'src/apps/main/x.ts': "import { Shard } from '../../fleet/shard';\n" }, /규칙 P — 앱은 모듈의 index.ts 만/],
      ['P 부름', { 'src/apps/main/x.ts': 'export const f = (fleet: { shards: { clear(): void } }) => fleet.shards.clear();\n' }, /규칙 P — 앱이 fleet\.shards\.clear/],
      ['N', { 'src/fleet/x.ts': "export const who = 'wolf-pack-1';\n" }, /규칙 N — 게임 명사 wolf/],
      ['N 문서', { 'design/02-roles/x.md': '# 요정이 걷는다\n' }, /규칙 N/],
      ['E', { 'src/fleet/x.ts': "import { spawn } from 'node:child_process';\nexport { spawn };\n" }, /규칙 E — child_process/],
      ['E 인자', { 'src/apps/main/x.ts': "import { hostArgv } from '../../protocol/engine';\nexport { hostArgv };\n" }, /규칙 E — 엔진의 진입점/],
      ['E 파일', { 'src/apps/main/x.ts': "import { VIEWER_PAGE } from '../../protocol/engine';\nexport { VIEWER_PAGE };\n" }, /규칙 E — 엔진의 파일 자리/],
    ];
    for (const [name, extra, want] of cases) {
      const found = check(tree({ ...base, ...extra }));
      expect(found, name).toHaveLength(1);
      expect(found[0], name).toMatch(want);
    }
    expect(check(tree(base))).toEqual([]);
    // 모듈의 tests/ 는 다른 모듈의 index.ts 로 세운다 — 안은 안 된다
    expect(check(tree({ ...base, 'src/fleet/tests/a.spec.ts': "import { openVault } from '../../storage';\n" }))).toEqual([]);
    expect(check(tree({ ...base, 'src/fleet/tests/a.spec.ts': "import { Vault } from '../../storage/vault';\n" }))[0]).toMatch(/규칙 F/);
  });

  it('check.ts 는 어긋나면 1 로 끝난다', () => {
    const root = tree({ ...base, 'src/account/x.ts': "import { Fleet } from '../fleet';\n" });
    const tsx = join(ROOT, 'node_modules', '.bin', 'tsx');
    let code = 0;
    try {
      execFileSync(tsx, [join(ROOT, 'src/tools/boundary/check.ts'), root], { stdio: 'pipe' });
    } catch (e) {
      code = (e as { status: number }).status;
    }
    expect(code).toBe(1);
  });
});
