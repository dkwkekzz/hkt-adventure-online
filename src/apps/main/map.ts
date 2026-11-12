// 관측의 지도 — design 에서 뽑는다 (design/README.md 의 Monitor.map, 흐름 14). 손으로 쓰지 않는다.
//   구조: README 의 「프로세스 넷」(마디) · 「연결 여덟」(연결 · 닿는 개념) · 「모듈 다섯과 그 개념」 · 「앱」(개념이 사는 프로세스)
//   흐름: design/01-flows 의 머리 · 트리거 · 한 줄 · 순서 블록 · 머리가 `#` 인 표
// 단계의 traced 는 src 의 코드(tests 밖)가 그 흔적 `(흐름, #)` 을 남기는가 — npm run index 도 traceSites 로 같은 것을 본다.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import type { FlowMap, MapConcept, MapFlow, MapLink, MapNode, MapStep } from '../../protocol/observe';

const cells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

/** 머리(`### 이름` · `## 이름`)로 시작하는 절의 첫 표 — 머리 줄과 줄들. */
function tableAfter(lines: readonly string[], head: string): { header: string[]; rows: string[][] } | null {
  const at = lines.findIndex((l) => l.trim() === head);
  if (at < 0) return null;
  let i = at + 1;
  while (i < lines.length && !lines[i]!.startsWith('|')) {
    if (/^#{1,3} /.test(lines[i]!)) return null;
    i++;
  }
  if (i >= lines.length) return null;
  const header = cells(lines[i]!);
  const rows: string[][] = [];
  for (i += 2; i < lines.length && lines[i]!.startsWith('|'); i++) rows.push(cells(lines[i]!));
  return { header, rows };
}

/** 밖의 마디 — 프로세스 표에 없는 끝. 연결의 방향 글이 이 이름들로 부른다. */
const EXTERNAL: readonly { id: string; name: string; aliases: readonly string[] }[] = [
  { id: 'client', name: '클라이언트', aliases: ['클라이언트'] },
  { id: 'engine', name: '엔진 — 호스트 · NPC 에이전트', aliases: ['엔진', '호스트'] },
  { id: 'storage', name: '스토리지', aliases: ['스토리지'] },
  { id: 'operator', name: '운영자', aliases: ['운영자'] },
  { id: 'observer', name: '수집기 · 관측 페이지', aliases: ['수집기', '운영자의 브라우저'] },
];

/** README 의 구조 — 마디 · 연결 · 개념. */
export function readStructure(readme: string): { nodes: MapNode[]; links: MapLink[]; concepts: Omit<MapConcept, 'built'>[] } {
  const lines = readme.split('\n');
  const nodes: MapNode[] = [];
  const procs = tableAfter(lines, '### 프로세스 넷');
  for (const row of procs?.rows ?? []) {
    const words = (row[0] ?? '').split(/\s+/);
    const id = words.at(-1) ?? '';
    nodes.push({ id, name: words.slice(0, -1).join(' '), external: false, listens: row[1] ?? '', holds: row[2] ?? '', scale: row[3] ?? '' });
  }
  const processIds = nodes.map((n) => n.id);
  for (const e of EXTERNAL) nodes.push({ id: e.id, name: e.name, external: true, listens: '', holds: '', scale: '' });

  /** 방향 글의 낱말 하나 → 마디들. 프로세스는 이름이 그 낱말로 시작하면(「노드」 → 「노드 에이전트」). */
  const resolve = (word: string): string[] => {
    const w = word.replace(/\([^)]*\)/g, '').trim();
    if (w === '프로세스마다') return processIds;
    const ext = EXTERNAL.find((e) => e.aliases.includes(w));
    if (ext !== undefined) return [ext.id];
    const p = nodes.find((n) => !n.external && (n.name === w || n.name.startsWith(w)));
    return p === undefined ? [] : [p.id];
  };

  const links: MapLink[] = [];
  const conn = tableAfter(lines, '### 연결 여덟');
  if (conn !== null) {
    const col = (row: string[], name: string): string => row[conn.header.indexOf(name)] ?? '';
    for (const row of conn.rows) {
      const direction = col(row, '방향');
      const segments = direction.split(/\s*(?:→|↔)\s*/).map((seg) => seg.split(/\s+·\s+/).flatMap(resolve));
      const pairs: [string, string][] = [];
      for (let i = 0; i + 1 < segments.length; i++)
        for (const a of new Set(segments[i])) for (const b of new Set(segments[i + 1])) if (!pairs.some(([x, y]) => x === a && y === b)) pairs.push([a, b]);
      const touches = col(row, '닿는 개념')
        .split(/\s+·\s+/)
        .map((t) => t.trim())
        .filter((t) => /^[A-Z]\w*$/.test(t));
      links.push({ name: col(row, '연결'), direction, carries: col(row, '싣는 것'), touches, pairs });
    }
  }

  // 앱의 개념 — 「## 앱」 아래 `### 이름` 마다 생애 줄이 어느 프로세스의 것인지 말한다. 말하지 않으면 프로세스마다
  const apps = new Map<string, { processes: string[]; duty: string }>();
  const appAt = lines.findIndex((l) => l.trim() === '## 앱');
  if (appAt >= 0) {
    let cur: string | null = null;
    for (let i = appAt + 1; i < lines.length && !/^## /.test(lines[i]!); i++) {
      const h = /^### ([A-Z]\w*)\s*$/.exec(lines[i]!);
      if (h !== null) {
        cur = h[1]!;
        apps.set(cur, { processes: processIds, duty: '' });
        continue;
      }
      if (cur === null) continue;
      const life = /^- 생애: (.*)$/.exec(lines[i]!);
      if (life !== null) {
        const found = nodes.filter((n) => !n.external && life[1]!.includes(n.name.split(' ')[0]!)).map((n) => n.id);
        apps.get(cur)!.processes = found.length > 0 ? found : processIds;
      }
      const fn = /^- 기능: (.*)$/.exec(lines[i]!);
      if (fn !== null) apps.get(cur)!.duty = fn[1]!.split('. ')[0]!.replace(/\.$/, '');
    }
  }

  const concepts: Omit<MapConcept, 'built'>[] = [];
  const mods = tableAfter(lines, '### 모듈 다섯과 그 개념');
  let module = '';
  for (const row of mods?.rows ?? []) {
    if ((row[0] ?? '') !== '') module = row[0]!.split(/\s+/).at(-1)!;
    const cell = row[1] ?? '';
    if (module === '앱') {
      for (const name of cell.split(/\s+·\s+/)) {
        const app = apps.get(name.trim());
        concepts.push({ name: name.trim(), module: 'app', duty: app?.duty ?? '', processes: app?.processes ?? processIds });
      }
      continue;
    }
    const [name = '', duty = ''] = cell.split(/\s+—\s+/);
    const processes = (row[2] ?? '')
      .replace(/\([^)]*\)/g, '')
      .split('·')
      .map((p) => p.trim())
      .filter((p) => processIds.includes(p));
    concepts.push({ name: name.trim(), module, duty: duty.trim(), processes });
  }
  return { nodes, links, concepts };
}

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

const TRACE = /\b(?:flow:\s*(\d+),\s*step:\s*(\d+)|mark\((\d+),\s*(\d+))/g;

/** src(tests · tools 밖)의 흔적 자리 — `flow: N, step: M` 또는 `mark(N, M`. 주석은 보지 않는다. */
export function traceSites(src: string): { file: string; flow: number; step: number }[] {
  const out: { file: string; flow: number; step: number }[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir).sort()) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== 'tests' && name !== 'node_modules' && name !== 'tools') walk(p);
        continue;
      }
      if (!name.endsWith('.ts')) continue;
      const code = readFileSync(p, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of code.matchAll(TRACE)) out.push({ file: relative(src, p).split('\\').join('/'), flow: Number(m[1] ?? m[3]), step: Number(m[2] ?? m[4]) });
    }
  };
  walk(src);
  return out;
}

const CONCEPT = /\b([A-Z][A-Za-z]*)\.[a-z][A-Za-z]*\b/;

/** 흐름 파일 하나 → MapFlow. 머리가 `# 흐름 N. 이름 — 한 줄` 이 아니면 null. traced 는 (흐름, #) → 흔적을 남기는가. */
export function readFlow(file: string, text: string, traced: (flow: number, step: number) => boolean): MapFlow | null {
  const lines = text.split('\n');
  const head = /^# 흐름 (\d+)\. (.+?)(?: — (.+))?$/.exec(lines[0] ?? '');
  if (head === null) return null;
  const flow = Number(head[1]);
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
    steps.push({ step: n, section, role: col('어느 role'), who, concept: CONCEPT.exec(who)?.[1] ?? null, what: col('무엇을'), result: col('결과'), traced: traced(flow, n) });
  }
  return { flow, file: basename(file), name: head[2]!.trim(), title: (head[3] ?? '').trim(), trigger: pick('트리거'), line: pick('한 줄'), order, steps };
}

/** design 전부 → FlowMap. src 는 개념의 파일 · 흔적 자리를 보는 자리. */
export function readMap(design: string, src: string): FlowMap {
  const names = builtNames(src);
  const sites = new Set(traceSites(src).map((t) => `${t.flow}.${t.step}`));
  const readme = join(design, 'README.md');
  const structure = readStructure(existsSync(readme) ? readFileSync(readme, 'utf8') : '');
  const dir = join(design, '01-flows');
  const flows: MapFlow[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    const flow = readFlow(join(dir, f), readFileSync(join(dir, f), 'utf8'), (fl, st) => sites.has(`${fl}.${st}`));
    if (flow !== null) flows.push(flow);
  }
  return {
    nodes: structure.nodes,
    links: structure.links,
    concepts: structure.concepts.map((c) => ({ ...c, built: names.has(c.name.toLowerCase()) })),
    flows,
  };
}
