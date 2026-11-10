// 가짜 엔진 체크아웃을 임시 자리에 세운다 — <dir>/web/node_modules/.bin/tsx 가 fixtures/fake-engine.mjs 를 돈다.
// Spawner 는 진짜와 같은 길(engineDir/web 에서 tsx <진입점> …)로 띄운다 — 테스트를 위한 갈래가 없다.

import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** esbuild 의 자리 — --outfile= 에 한 줄을 쓴다. 엔트리가 없으면 1 로 끝난다(묶지 못함). */
const ESBUILD = `#!/bin/sh
for a in "$@"; do case "$a" in --outfile=*) out="\${a#--outfile=}";; esac; done
[ -f "$1" ] || { echo "✘ [ERROR] Could not resolve $1" >&2; exit 1; }
echo "/* fake viewer */" > "$out"
echo "{}" > "$out.map"
`;

export function fakeEngine(opts: { viewer?: boolean } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'engine-'));
  const web = join(dir, 'web');
  const bin = join(web, 'node_modules', '.bin');
  mkdirSync(bin, { recursive: true });
  const script = resolve(import.meta.dirname, 'fixtures', 'fake-engine.mjs');
  writeFileSync(join(bin, 'tsx'), `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
  writeFileSync(join(bin, 'esbuild'), ESBUILD);
  chmodSync(join(bin, 'tsx'), 0o755);
  chmodSync(join(bin, 'esbuild'), 0o755);
  // 뷰어의 정적 자리 — 페이지 · 엔트리 · 실물 하나 · 만든 캐릭터 하나 · Keymap
  if (opts.viewer !== false) {
    mkdirSync(join(web, 'apps', 'viewer'), { recursive: true });
    writeFileSync(join(web, 'apps', 'viewer', 'page.html'), '<!doctype html><script src="viewer.js"></script>\n');
    writeFileSync(join(web, 'apps', 'viewer', 'browser.ts'), '// entry\n');
  }
  mkdirSync(join(web, 'assets', 'images'), { recursive: true });
  writeFileSync(join(web, 'assets', 'index.json'), '{"x":1}\n');
  writeFileSync(join(web, 'assets', 'images', 'a.png'), 'png');
  mkdirSync(join(dir, 'out', 'character', 'fairy'), { recursive: true });
  writeFileSync(join(dir, 'out', 'character', 'fairy', 'b.glb'), 'glb');
  mkdirSync(join(web, 'dataset'), { recursive: true });
  writeFileSync(join(web, 'dataset', 'keymap.json'), '{"keys":{}}\n');
  return dir;
}

/** 사람 하나가 그 포트의 가짜 호스트에 붙는다 — 닫으면 끊긴다. */
export function join_(port: number, account: string): Promise<() => void> {
  return new Promise((ok, fail) => {
    const req = request({ host: 'localhost', port, path: `/join?account=${account}` }, (res) => {
      res.once('data', () => ok(() => req.destroy()));
    });
    req.on('error', fail);
    req.end();
  });
}

export const until = async (cond: () => boolean, ms = 5000): Promise<void> => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('기다리다 지쳤다');
    await new Promise((r) => setTimeout(r, 10));
  }
};

// 테스트 파일(워커)마다 따로인 범위 — 워커끼리 겹치면 가짜 호스트가 포트를 두고 다툰다
let next = 40000 + Number(process.env['VITEST_POOL_ID'] ?? '0') * 400 + Math.floor(Math.random() * 40) * 5;
/** 테스트마다 다른 포트 범위 다섯. */
export const portRange = (): [number, number] => {
  const from = next;
  next += 5;
  return [from, from + 4];
};
