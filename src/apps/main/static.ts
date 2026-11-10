// Static — 뷰어의 페이지 · 묶음 · 실물 · Keymap 을 서비스의 한 주소에서 준다 (design/README.md 의 Static).
// 엔진의 dev 가 샤드마다 주던 넷(ONLINE.md §1.6)을 서비스가 한 번 준다 — 샤드는 소켓만 연다(엔진의 host). 뷰어는 ?ws= 로 자기 샤드에 붙는다.
// 엔진의 파일을 읽는 것은 Spawner(띄움 · 묶음)와 여기 둘뿐이다(경계 규칙 E). 파일의 안은 보지 않고 그대로 준다.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { ASSET_TYPES, ENGINE_WEB, VIEWER_ASSETS, VIEWER_EXT, VIEWER_PAGE } from '../../protocol/engine';

export interface Served {
  readonly type: string;
  readonly body: Buffer;
}

/** 뿌리 안의 파일만 — `..` 로 밖에 나가지 않는다. */
const inside = (root: string, rel: string): string | null => {
  const file = resolve(root, rel);
  const r = relative(root, file);
  if (r === '' || r.startsWith('..') || resolve(r) === r) return null;
  return existsSync(file) && statSync(file).isFile() ? file : null;
};

export class Static {
  // 데이터 — 엔진의 web 자리 · 묶음의 자리 · Keymap 파일(엔진 web 상대, 없으면 null). 전부 불변
  readonly web: string;
  readonly viewerOut: string;
  readonly keymap: string | null;

  constructor(engineDir: string, viewerOut: string, keymap: string | null) {
    this.web = join(engineDir, ENGINE_WEB);
    this.viewerOut = viewerOut;
    this.keymap = keymap === null ? null : resolve(this.web, keymap);
  }

  /** serve — 경로 하나 → 줄 것 또는 null(없다). `/play` 가 페이지다(`/` 는 게스트 페이지). */
  serve(path: string): Served | null {
    if (path === '/play' || path === '/play/') return { type: 'text/html; charset=utf-8', body: readFileSync(join(this.web, VIEWER_PAGE)) };
    if (path === '/viewer.js' || path === '/viewer.js.map') {
      const file = join(dirname(this.viewerOut), path.slice(1));
      if (!existsSync(file)) return null;
      return { type: path.endsWith('.map') ? 'application/json' : 'text/javascript; charset=utf-8', body: readFileSync(file) };
    }
    if (path === '/keymap.json') return this.keymap !== null && existsSync(this.keymap) ? { type: ASSET_TYPES['.json']!, body: readFileSync(this.keymap) } : null;
    if (path.startsWith('/assets/')) {
      const rel = decodeURIComponent(path.slice('/assets/'.length));
      const file = rel.startsWith('ext/') ? inside(resolve(this.web, VIEWER_EXT), rel.slice(4)) : inside(join(this.web, VIEWER_ASSETS), rel);
      if (file === null) return null;
      return { type: ASSET_TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) };
    }
    return null;
  }
}
