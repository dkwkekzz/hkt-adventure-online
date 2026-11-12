// 설계 색인 — 이 저장소의 흐름 단계는 전부 책임에 있고, 책임에 없는 단계는 ✗ 로 찍힌다 (plan 01). 코드의 흔적은 전부 흐름의 표에 있다(plan 02).

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { steps, traceSites } from '../main';

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

  it('흔적 — 이 저장소의 흔적 자리는 전부 흐름의 표에 있다. 없는 # 은 ✗', () => {
    const root = resolve(import.meta.dirname, '..', '..', '..', '..');
    const sites = traceSites(join(root, 'design'), join(root, 'src'));
    expect(sites.length).toBeGreaterThan(20);
    expect(sites.filter((t) => !t.ok)).toEqual([]);

    const d = mkdtempSync(join(tmpdir(), 'idx-'));
    mkdirSync(join(d, 'design', '01-flows'), { recursive: true });
    mkdirSync(join(d, 'src', 'x', 'tests'), { recursive: true });
    writeFileSync(join(d, 'design', '01-flows', '01-x.md'), '# 흐름 1. 시험\n\n| # | 누가 | 무엇을 | 결과 |\n|---|---|---|---|\n| 1 | A.go | 간다 | |\n');
    writeFileSync(join(d, 'src', 'x', 'a.ts'), "trace({ flow: 1, step: 1 }); this.mark(1, 2, run); // flow: 9, step: 9 는 주석\n");
    writeFileSync(join(d, 'src', 'x', 'tests', 'b.ts'), 'trace({ flow: 7, step: 7 });\n');
    expect(traceSites(join(d, 'design'), join(d, 'src')).map((t) => `${t.file} ${t.flow}.${t.step} ${t.ok ? 'o' : 'x'}`)).toEqual(['x/a.ts 1.1 o', 'x/a.ts 1.2 x']);
  });
});
