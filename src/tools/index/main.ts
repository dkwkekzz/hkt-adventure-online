// 설계 색인 — npm run index [-- --quiet]. 흐름(design/01-flows)의 단계 `개념.기능` 이 전부 책임(design/02-roles · README 의 앱)에 있는가 (plan stage 2).
// 개념은 책임 파일의 `### <이름>` 머리, 기능은 그 개념의 `- 기능:` · `- 데이터:` 줄에 그 낱말이 있는가. 없으면 ✗ 를 찍고 1 로 끝난다.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Concept {
  readonly name: string;
  readonly file: string;
  readonly text: string; // 데이터 · 기능 줄
}

export function concepts(design: string): Map<string, Concept> {
  const out = new Map<string, Concept>();
  const files = [join(design, 'README.md'), ...readdirSync(join(design, '02-roles')).map((f) => join(design, '02-roles', f))];
  for (const file of files) {
    let cur: { name: string; lines: string[] } | null = null;
    const flush = (): void => {
      if (cur !== null) out.set(cur.name, { name: cur.name, file, text: cur.lines.join('\n') });
    };
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const h = /^###\s+([A-Z]\w*)\s*$/.exec(line);
      if (h !== null) {
        flush();
        cur = { name: h[1]!, lines: [] };
      } else if (/^#{1,3}\s/.test(line)) {
        flush();
        cur = null;
      } else if (cur !== null && /^- (기능|데이터):/.test(line)) cur.lines.push(line);
    }
    flush();
  }
  return out;
}

export interface Step {
  readonly flow: string;
  readonly concept: string;
  readonly fn: string;
  readonly ok: boolean;
  readonly why: string;
}

const STEP = /\b([A-Z][A-Za-z]*)\.([a-z][A-Za-z]*)\b/g;
const FILE_EXT = new Set(['md', 'ts', 'json', 'js', 'html']);

export function steps(design: string): Step[] {
  const known = concepts(design);
  const out: Step[] = [];
  const dir = join(design, '01-flows');
  for (const f of readdirSync(dir).sort()) {
    const seen = new Set<string>();
    for (const m of readFileSync(join(dir, f), 'utf8').matchAll(STEP)) {
      const [, concept, fn] = m as unknown as [string, string, string];
      if (FILE_EXT.has(fn) || seen.has(`${concept}.${fn}`)) continue;
      seen.add(`${concept}.${fn}`);
      const c = known.get(concept);
      const ok = c !== undefined && new RegExp(`\\b${fn}\\b`).test(c.text);
      out.push({ flow: f, concept, fn, ok, why: c === undefined ? '개념이 책임에 없다' : ok ? '' : `${c.file.split('/').slice(-1)[0]} 의 ${concept} 에 ${fn} 이 없다` });
    }
  }
  return out;
}

const direct = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const design = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'design');
  const quiet = process.argv.includes('--quiet');
  const all = steps(design);
  const bad = all.filter((s) => !s.ok);
  if (!quiet) {
    let flow = '';
    for (const s of all) {
      if (s.flow !== flow) console.log(`\n${(flow = s.flow)}`);
      console.log(`  ${s.ok ? '✓' : '✗'} ${s.concept}.${s.fn}${s.ok ? '' : ` — ${s.why}`}`);
    }
    console.log('');
  } else for (const s of bad) console.log(`✗ ${s.flow} ${s.concept}.${s.fn} — ${s.why}`);
  console.log(`색인 — 흐름 ${new Set(all.map((s) => s.flow)).size} · 단계 ${all.length} · 책임에 없는 것 ${bad.length}`);
  if (bad.length > 0) process.exit(1);
}
