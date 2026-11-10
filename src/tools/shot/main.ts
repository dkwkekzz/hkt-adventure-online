// 화면 확인 — npm run shot [-- --url http://localhost:8000 --out out/shot --wait 6000 --query '&fx=off&scene=off&tiles=flat']. 검사 밖.
// --query 는 뷰어 페이지에 덧붙이는 질의 — 기본은 가벼운 그림(헤드리스의 소프트웨어 GPU 는 큰 세계의 3D 장면을 찍는 동안 멈춘다). 빈 글이면 그대로.
// 떠 있는 서비스의 게스트 페이지를 헤드리스 크로미움으로 열어 「들어가기」를 누르고, 받은 샤드의 뷰어가 body 를 맡을 때까지 기다려 찍는다.
// 찍는 것: <out>/landing.png(게스트 페이지) · <out>/viewer.png(샤드의 뷰어). playwright 는 이 저장소의 의존이 아니다 — 깔린 것을 쓴다.

import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

interface Page {
  goto(url: string): Promise<unknown>;
  click(sel: string): Promise<void>;
  screenshot(o: { path: string }): Promise<unknown>;
  waitForURL(u: RegExp, o: { timeout: number }): Promise<void>;
  waitForFunction(f: () => boolean, a: null, o: { timeout: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  textContent(sel: string): Promise<string | null>;
  url(): string;
}

const arg = (name: string, d: string): string => {
  const i = process.argv.indexOf(name);
  return i < 0 ? d : (process.argv[i + 1] ?? d);
};

async function main(): Promise<void> {
  const url = arg('--url', 'http://localhost:8000');
  const out = resolve(arg('--out', 'out/shot'));
  const wait = Number(arg('--wait', '6000'));
  const query = arg('--query', '&fx=off&scene=off&tiles=flat');
  let playwright: { chromium: { launch(o: object): Promise<{ newPage(o: object): Promise<Page>; close(): Promise<void> }> } };
  try {
    playwright = createRequire(import.meta.url)('playwright');
  } catch {
    throw new Error('playwright 가 없다 — 깔린 크로미움 · playwright 가 있는 자리에서 돌린다');
  }
  mkdirSync(out, { recursive: true });
  const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    await page.goto(url);
    await page.screenshot({ path: join(out, 'landing.png') });
    await page.click('#go');
    await page.waitForURL(/\?token=/, { timeout: 120000 });
    if (query !== '') await page.goto(page.url() + query);
    await page.waitForFunction(() => /body \d/.test(document.getElementById('status')?.textContent ?? ''), null, { timeout: 60000 });
    await page.waitForTimeout(wait);
    console.log(`뷰어 ${page.url().replace(/token=[^&]+/, 'token=…')}`);
    console.log(`상태 줄 ${await page.textContent('#status')}`);
    await page.screenshot({ path: join(out, 'viewer.png') });
    console.log(`찍었다 — ${join(out, 'landing.png')} · ${join(out, 'viewer.png')}`);
  } finally {
    await browser.close();
  }
}

main().catch((e: unknown) => {
  console.error(`[shot] ${(e as Error).message}`);
  process.exit(1);
});
