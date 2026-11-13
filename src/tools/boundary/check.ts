// 경계 검사 — npm run boundary:check (npm run check 의 앞단). 어긋남이 있으면 찍고 1 로 끝난다.
//   tsx src/tools/boundary/check.ts [저장소 뿌리]     기본은 이 저장소. 테스트가 임시 나무로 부른다
// 규칙은 rules.ts 가 판단한다. 여기는 src/**/*.ts 의 import 와 앱의 부름을 읽고, design 의 책임 · 흐름 문서의 명사를 읽는다.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeAppCall, judgeEngine, judgeImport, layerOf, nounsIn } from './rules';

const walk = (dir: string, ext: string): string[] =>
  !existsSync(dir)
    ? []
    : readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? (name === 'node_modules' || name === 'fixtures' ? [] : walk(p, ext)) : p.endsWith(ext) ? [p] : [];
      });

const IMPORT = /^\s*(?:import|export)\s+(type\s+)?([^'"]*?)\s*from\s*['"]([^'"]+)['"]/gm;
const CALL = /\b(directory|signer|fleet|storage|gateway)\.((?:[A-Za-z_]\w*\.)*[A-Za-z_]\w*)\s*\(/g;

export function check(root: string): string[] {
  const src = join(root, 'src');
  const out: string[] = [];
  for (const file of walk(src, '.ts')) {
    const rel = relative(src, file).split('\\').join('/');
    const from = layerOf(rel);
    if (from === null) continue;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(IMPORT)) {
      const spec = m[3]!;
      const names = m[2]!.replace(/[{}]/g, ' ').split(/[\s,]+/).filter((n) => n !== '' && n !== 'type');
      const e = judgeEngine(rel, spec, names);
      if (e !== null) out.push(`${rel} — ${e}`);
      if (!spec.startsWith('.')) continue;
      let target = resolve(dirname(file), spec);
      if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.ts');
      else if (!target.endsWith('.ts')) target += '.ts';
      const toRel = relative(src, target).split('\\').join('/');
      if (toRel.startsWith('..')) {
        out.push(`${rel} — src 밖을 import 한다 (${spec})`);
        continue;
      }
      const to = layerOf(toRel);
      if (to === null) continue;
      const j = judgeImport(from, to);
      if (j !== null) out.push(`${rel} — ${j} — ${spec}`);
    }
    const code = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''); // 주석은 명사 · 부름을 보지 않는다
    if (from.kind === 'app' && !from.test) {
      for (const m of code.matchAll(CALL)) {
        const j = judgeAppCall(m[1]!, m[2]!);
        if (j !== null) out.push(`${rel} — ${j}`);
      }
    }
    if ((from.kind === 'module' || from.kind === 'app' || from.kind === 'protocol') && !rel.split('/').includes('tests')) {
      const nouns = nounsIn(text);
      if (nouns.length > 0) out.push(`${rel} — 규칙 N — 게임 명사 ${nouns.join(', ')} (값은 service.config.json 에)`);
    }
  }
  for (const doc of [...walk(join(root, 'design', '02-roles'), '.md'), ...walk(join(root, 'design', '01-flows'), '.md')]) {
    const nouns = nounsIn(readFileSync(doc, 'utf8'));
    if (nouns.length > 0) out.push(`${relative(root, doc)} — 규칙 N — 게임 명사 ${nouns.join(', ')}`);
  }
  return out;
}

const direct = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) {
  const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'));
  const found = check(root);
  if (found.length === 0) console.log('경계 — 어긋남 0 (S · A · T · F · G · P · N · E)');
  else {
    for (const f of found) console.log(`✗ ${f}`);
    console.log(`경계 — 어긋남 ${found.length}`);
    process.exit(1);
  }
}
