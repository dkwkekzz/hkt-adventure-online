// Static — 뷰어의 페이지 · 묶음 · 실물 · Keymap 을 서비스의 한 주소에서 준다 (design/README.md 의 Static).
// 엔진의 dev 가 샤드마다 주던 넷(ONLINE.md §1.6)을 서비스가 한 번 준다 — 샤드는 소켓만 연다(엔진의 host). 뷰어는 ?ws= 로 자기 샤드에 붙는다.
// 엔진의 파일을 읽는 것은 Spawner(띄움 · 묶음)와 여기 둘뿐이다(경계 규칙 E). 파일의 안은 보지 않고 그대로 준다.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

/** 조작 틀의 이름 — 글자 · 숫자 · `-` 뿐(엔진 apps/server/dev.ts 의 keymapFile 과 같다). */
const SCHEME_NAME = /^[a-z0-9-]+$/i;

export class Static {
  // 데이터 — 엔진의 web 자리 · 묶음의 자리 · Keymap(엔진 web 상대의 파일 또는 조작 틀의 폴더, 없으면 null) · 기본 조작 틀. 전부 불변
  readonly web: string;
  readonly viewerOut: string;
  readonly keymap: string | null;
  readonly scheme: string | null;

  constructor(engineDir: string, viewerOut: string, keymap: string | null, scheme: string | null = null) {
    this.web = join(engineDir, ENGINE_WEB);
    this.viewerOut = viewerOut;
    this.keymap = keymap === null ? null : resolve(this.web, keymap);
    this.scheme = scheme;
  }

  /**
   * keymapFile — 줄 Keymap 파일 하나(엔진의 dev 가 주는 것과 같다 — ONLINE.md §1.6). keymap 이 파일이면 그것.
   * 폴더면 그 안의 `<scheme>.json` 하나가 조작 틀 하나 — 페이지의 `?scheme=` 이 없으면 기본 조작 틀, 그것도 없으면 이름 순의 첫 틀. 없으면 null(뷰어는 메뉴로만 고른다).
   */
  keymapFile(scheme: string | null = null): string | null {
    const keymap = this.keymap;
    if (keymap === null || !existsSync(keymap)) return null;
    if (!statSync(keymap).isDirectory()) return keymap;
    const of = (name: string | null): string | null => (name !== null && SCHEME_NAME.test(name) && existsSync(join(keymap, `${name}.json`)) ? join(keymap, `${name}.json`) : null);
    if (scheme !== null) return of(scheme);
    const first = readdirSync(keymap).filter((f) => f.endsWith('.json')).sort()[0];
    return of(this.scheme) ?? (first === undefined ? null : join(keymap, first));
  }

  /** serve — 경로 하나(와 페이지가 고른 조작 틀) → 줄 것 또는 null(없다). `/play` 가 페이지다(`/` 는 게스트 페이지). */
  serve(path: string, scheme: string | null = null): Served | null {
    if (path === '/play' || path === '/play/') return { type: 'text/html; charset=utf-8', body: readFileSync(join(this.web, VIEWER_PAGE)) };
    if (path === '/viewer.js' || path === '/viewer.js.map') {
      const file = join(dirname(this.viewerOut), path.slice(1));
      if (!existsSync(file)) return null;
      return { type: path.endsWith('.map') ? 'application/json' : 'text/javascript; charset=utf-8', body: readFileSync(file) };
    }
    if (path === '/keymap.json') {
      const file = this.keymapFile(scheme);
      return file === null ? null : { type: ASSET_TYPES['.json']!, body: readFileSync(file) };
    }
    if (path.startsWith('/assets/')) {
      const rel = decodeURIComponent(path.slice('/assets/'.length));
      const file = rel.startsWith('ext/') ? inside(resolve(this.web, VIEWER_EXT), rel.slice(4)) : inside(join(this.web, VIEWER_ASSETS), rel);
      if (file === null) return null;
      return { type: ASSET_TYPES[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) };
    }
    return null;
  }
}
