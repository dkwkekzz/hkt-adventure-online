// 화면 확인 — npm run shot [-- --url http://localhost:8000 --out out/shot --wait 6000 --query '&fx=off&scene=off&tiles=flat' --monitor http://localhost:8001 --viewer off]. 검사 밖.
// --monitor 가 있으면 뷰어 뒤에 관측 페이지를 찍는다 — <out>/observe.png(서버 보기) · observe-flow.png(대신 하는 단계가 있는 서버의 흐름의 길) · observe-plan.png(plan 진행표, 대신이 가장 많은 plan 을 펴서) · observe-people.png(사람 보기, 첫 사람을 골라). --viewer off 면 게스트 페이지 · 뷰어를 건너뛴다.
// --query 는 뷰어 페이지에 덧붙이는 질의 — 기본은 가벼운 그림(헤드리스의 소프트웨어 GPU 는 큰 세계의 3D 장면을 찍는 동안 멈춘다). 빈 글이면 그대로.
// 떠 있는 서비스의 게스트 페이지를 헤드리스 크로미움으로 열어 「들어가기」를 누르고, 받은 샤드의 뷰어가 body 를 맡을 때까지 기다려 찍는다.
// 찍는 것: <out>/landing.png(게스트 페이지) · <out>/viewer.png(샤드의 뷰어). playwright 는 이 저장소의 의존이 아니다 — 깔린 것을 쓴다.

import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

interface Page {
  goto(url: string): Promise<unknown>;
  click(sel: string): Promise<void>;
  screenshot(o: { path: string; fullPage?: boolean }): Promise<unknown>;
  waitForURL(u: RegExp, o: { timeout: number }): Promise<void>;
  waitForFunction(f: () => boolean, a: null, o: { timeout: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  textContent(sel: string): Promise<string | null>;
  url(): string;
  $(sel: string): Promise<{ click(): Promise<void> } | null>;
  $$eval<T>(sel: string, f: (els: Element[]) => T): Promise<T>;
  close(): Promise<void>;
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
  const monitor = arg('--monitor', '');
  const viewer = arg('--viewer', 'on') !== 'off';
  let playwright: { chromium: { launch(o: object): Promise<{ newPage(o: object): Promise<Page>; close(): Promise<void> }> } };
  try {
    playwright = createRequire(import.meta.url)('playwright');
  } catch {
    throw new Error('playwright 가 없다 — 깔린 크로미움 · playwright 가 있는 자리에서 돌린다');
  }
  mkdirSync(out, { recursive: true });
  const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    let page: Page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
    if (viewer) await shootViewer(page, url, out, wait, query);
    if (monitor !== '') {
      if (viewer) {
        await page.close(); // 뷰어의 탭은 3D 를 그리느라 바쁘다 — 닫고 관측은 새 탭에서
        page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
      }
      await page.goto(`${monitor.replace(/\/$/, '')}/observe/page#3`);
      await page.waitForFunction(() => /듣는 중/.test(document.getElementById('conn')?.textContent ?? ''), null, { timeout: 10000 });
      await page.waitForTimeout(800);
      console.log(`관측 ${await page.textContent('#total')} · ${await page.textContent('#conn')}`);
      await page.screenshot({ path: join(out, 'observe.png'), fullPage: true });
      console.log(`찍었다 — ${join(out, 'observe.png')}`);
      // 흐름 하나의 길(섰다 · 대신 · 없다) — 대신 하는 단계가 있는 첫 서버의 흐름(없으면 첫 것)
      const flow = await page.$$eval('#side .frow', (rows) => (rows.find((r) => /·/.test(r.querySelector('.c')?.textContent ?? '')) ?? rows[0])?.getAttribute('data-flow') ?? null);
      if (flow !== null) await page.click(`#side .frow[data-flow="${flow}"]`);
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(out, 'observe-flow.png'), fullPage: true });
      console.log(`찍었다 — ${join(out, 'observe-flow.png')}`);
      // plan 진행표 — 대신 하는 단계가 가장 많은 plan 을 펴서 그 자리로
      // 브라우저 안에서 도는 함수 — 안에 이름 붙은 함수를 두지 않는다(tsx 가 __name 을 감싼다)
      const plan = await page.$$eval('#side [data-plan]', (rows) =>
        rows
          .map((r) => [Number(/대신 (\d+)/.exec(r.textContent ?? '')?.[1] ?? 0), r.getAttribute('data-plan')] as const)
          .sort((a, b) => b[0] - a[0])[0]?.[1] ?? null,
      );
      if (plan !== null) {
        await page.click(`#side [data-plan="${plan}"]`);
        await page.waitForTimeout(300);
        // 옆 판은 제 안에서 흐른다 — 그 판을 그 줄까지 내리고, 판이 늘지 않게 화면만 찍는다
        await page.$$eval('#side .plan.sel', (rows) => {
          const side = rows[0]?.closest('.side');
          if (rows[0] !== undefined && side !== null && side !== undefined) side.scrollTop = (rows[0] as HTMLElement).offsetTop - (side as HTMLElement).offsetTop - 40;
        });
        await page.waitForTimeout(300);
        await page.screenshot({ path: join(out, 'observe-plan.png') });
        console.log(`찍었다 — ${join(out, 'observe-plan.png')}`);
      }
      const people = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
      await people.goto(`${monitor.replace(/\/$/, '')}/observe/page#people`);
      await people.waitForFunction(() => /듣는 중/.test(document.getElementById('conn')?.textContent ?? ''), null, { timeout: 10000 });
      const someone = await people.$('#side [data-who]');
      if (someone !== null) await someone.click();
      await people.waitForTimeout(800);
      await people.screenshot({ path: join(out, 'observe-people.png'), fullPage: true });
      console.log(`찍었다 — ${join(out, 'observe-people.png')}`);
    }
  } finally {
    await browser.close();
  }
}

async function shootViewer(page: Page, url: string, out: string, wait: number, query: string): Promise<void> {
  {
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
  }
}

main().catch((e: unknown) => {
  console.error(`[shot] ${(e as Error).message}`);
  process.exit(1);
});
