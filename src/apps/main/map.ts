// 흐름의 지도 — design/01-flows 의 흐름 파일에서 흐름 · 단계 · 순서를 뽑는다 (design/README.md 의 Monitor.map, 흐름 14). 손으로 쓰지 않는다.
// 단계는 머리가 `| # |` 인 표의 줄이다. 누가 칸의 개념이 src 에 파일(`<개념>.ts`, tests 밖)로 섰으면 built.
// npm run index 도 이것으로 코드의 흔적 `(흐름, #)` 이 흐름에 있는가를 본다.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { FlowMap, MapFlow, MapStep } from '../../protocol/observe';

const cells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/** src 아래(tests · node_modules 밖)의 .ts 파일 이름 — 소문자, '-' · '_' 를 뺀 것. */
function builtNames(src: string): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== 'tests' && name !== 'node_modules') walk(p);
      } else if (name.endsWith('.ts')) out.add(basename(name, '.ts').toLowerCase().replace(/[-_]/g, ''));
    }
  };
  walk(src);
  return out;
}

const CONCEPT = /\b([A-Z][A-Za-z]*)\.[a-z][A-Za-z]*\b/;

/** 흐름 파일 하나 → MapFlow. 머리가 `# 흐름 N. 이름 — 한 줄` 이 아니면 null. */
export function readFlow(file: string, text: string, built: (concept: string) => boolean): MapFlow | null {
  const lines = text.split('\n');
  const head = /^# 흐름 (\d+)\. (.+?)(?: — (.+))?$/.exec(lines[0] ?? '');
  if (head === null) return null;
  const pick = (label: string): string => (lines.find((l) => l.startsWith(`${label}:`)) ?? '').slice(label.length + 1).trim();
  let order = '';
  const at = lines.findIndex((l) => l.trim() === '## 순서');
  if (at >= 0) {
    const open = lines.findIndex((l, i) => i > at && l.startsWith('```'));
    const close = lines.findIndex((l, i) => i > open && l.startsWith('```'));
    if (open >= 0 && close > open) order = lines.slice(open + 1, close).join('\n');
  }
  const steps: MapStep[] = [];
  let section = '';
  let columns: string[] | null = null;
  for (const line of lines) {
    const sec = /^### (.+)$/.exec(line);
    if (sec !== null) {
      section = sec[1]!.trim();
      columns = null;
      continue;
    }
    if (/^## /.test(line)) {
      if (line.trim() !== '## 순서') section = '';
      columns = null;
      continue;
    }
    if (!line.startsWith('|')) {
      columns = null;
      continue;
    }
    const row = cells(line);
    if (columns === null) {
      columns = row[0] === '#' ? row : [];
      continue;
    }
    if (columns.length === 0 || /^-+$/.test(row[0] ?? '')) continue;
    const n = Number(row[0]);
    if (!Number.isInteger(n) || n <= 0) continue;
    const col = (name: string): string => {
      const i = columns!.indexOf(name);
      return i < 0 ? '' : (row[i] ?? '');
    };
    const who = col('누가');
    const concept = CONCEPT.exec(who)?.[1];
    steps.push({ step: n, section, role: col('어느 role'), who, what: col('무엇을'), result: col('결과'), built: concept !== undefined && built(concept) });
  }
  return { flow: Number(head[1]), file: basename(file), name: head[2]!.trim(), title: (head[3] ?? '').trim(), trigger: pick('트리거'), line: pick('한 줄'), order, steps };
}

/** design/01-flows 전부 → FlowMap. src 는 built 를 가리는 자리. */
export function readMap(design: string, src: string): FlowMap {
  const names = builtNames(src);
  const dir = join(design, '01-flows');
  const flows: MapFlow[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    const flow = readFlow(join(dir, f), readFileSync(join(dir, f), 'utf8'), (c) => names.has(c.toLowerCase()));
    if (flow !== null) flows.push(flow);
  }
  return { flows };
}
