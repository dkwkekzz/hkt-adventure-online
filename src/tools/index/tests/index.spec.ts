// 설계 색인 — 이 저장소의 흐름 단계는 전부 책임에 있고, 책임에 없는 단계는 ✗ 로 찍힌다 (plan stage 2).

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { steps } from '../main';

describe('설계 색인', () => {
  it('이 저장소 — 책임에 없는 단계 0', () => {
    const all = steps(resolve(import.meta.dirname, '..', '..', '..', '..', 'design'));
    expect(all.length).toBeGreaterThan(30);
    expect(all.filter((s) => !s.ok)).toEqual([]);
  });

  it('없는 개념 · 없는 기능 · 파일 이름은 단계가 아니다', () => {
    const d = mkdtempSync(join(tmpdir(), 'idx-'));
    mkdirSync(join(d, '01-flows'));
    mkdirSync(join(d, '02-roles'));
    writeFileSync(join(d, 'README.md'), '# x\n### Service\n- 기능: start 는 흐름 1.\n');
    writeFileSync(join(d, '02-roles', 'a.md'), '# a\n### Box\n- 데이터: size:int\n- 기능: open(x) 는 연다.\n## 소켓\n');
    writeFileSync(join(d, '01-flows', '01-x.md'), 'Service.start · Box.open · Box.close · Ghost.walk · Box.size · README.md\n');
    const got = steps(d).map((s) => `${s.concept}.${s.fn}:${s.ok ? 'o' : 'x'}`);
    expect(got).toEqual(['Service.start:o', 'Box.open:o', 'Box.close:x', 'Ghost.walk:x', 'Box.size:o']);
  });
});
