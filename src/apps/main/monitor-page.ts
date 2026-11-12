// 관측 페이지 한 장 — Monitor.page 가 준다(흐름 14 의 3). 의존 없음 — 글 · CSS · 스크립트가 이 한 장에 든다.
// 보기 둘(흐름 14 「보기 둘」). 두 보기 모두 같은 구조의 그림 — 프로세스 넷(api · gateway · control · node)과 밖(클라이언트 · 엔진 · 스토리지 · 운영자), 그 사이의 연결.
//   서버 — 서비스 전체. 상자마다 state · 지난 단계, 노드 서버 안의 인스턴스, 연결마다 넘은 수. 움직이는 글은 사람이 일으키지 않은 흐름(1 · 4 · 5 · 6 · 7 · 12 · 13)의 것.
//          옆: 프로세스 · 인스턴스의 state, 운영자의 명령, 기계의 흐름마다의 셈(거절 · 실패만 줄로), 서버의 흐름. 아래: 서버의 글.
//   사람 — 접속한 사람마다. 옆: 인스턴스마다 묶은 사람들(이름 또는 가명 · person · 세션 · 마지막 흐름). 고르면 그림에는 그 사람의 길과 글만, 아래에는 그 사람의 일생.
// 흐름을 고르면 그 단계들이 구조 위에 놓인다: 마디마다 거기서 일어나는 # , 연결마다 그 사이를 넘는 # . 「재생」은 그 길을 차례로 보낸다.
// 단계가 놓이는 곳은 관측의 지도(README 의 표)에서 — 개념이 사는 프로세스, 여럿이면 앞 단계와 같은 곳. 흐름 1 · 7 은 어느 role 칸.
// ?from=<주소>,<주소> 면 여러 Monitor 의 stream 을 함께 읽는다(비면 이 페이지의 자리). #people 이면 사람 보기로 연다.

import type { FlowMap } from '../../protocol/observe';

export function monitorPage(map: FlowMap): string {
  const data = JSON.stringify(map).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>서비스 관측</title>
<style>
:root {
  --bg: #f5f6f8; --panel: #ffffff; --line: #d9dee4; --ink: #1c2228; --mute: #67717c; --soft: #eef1f4; --box: #ffffff;
  --ok: #1f9d55; --wait: #2f6fdb; --refused: #c27c0e; --failed: #d64545; --hl: #7c4dff; --glow: #2f6fdb2e;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #101317; --panel: #171b20; --line: #2c333b; --ink: #e4e8ec; --mute: #8b95a1; --soft: #1f252c; --box: #1b2026;
    --ok: #3ccf7c; --wait: #5b93f5; --refused: #e2a23b; --failed: #f06a6a; --hl: #a98bff; --glow: #5b93f53a; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
header { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--line); background: var(--panel); }
header h1 { font-size: 15px; margin: 0; font-weight: 650; }
.views { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.views button { border: 0; border-radius: 0; padding: 5px 14px; font-size: 13px; }
.views button.on { background: var(--hl); color: #fff; }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px; border: 1px solid var(--line); border-radius: 999px; font-size: 12px; color: var(--mute); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--mute); display: inline-block; flex: none; }
.dot.ok { background: var(--ok); } .dot.wait { background: var(--wait); } .dot.refused { background: var(--refused); } .dot.failed { background: var(--failed); }
main { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 12px; padding: 12px 16px; align-items: start; }
@media (max-width: 1100px) { main { grid-template-columns: minmax(0, 1fr); } }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px; min-width: 0; }
.side { max-height: calc(100vh - 80px); overflow: auto; }
@media (max-width: 1100px) { .side { max-height: none; } }
.wide { grid-column: 1 / -1; }
h2 { font-size: 12px; color: var(--mute); margin: 0 0 8px; font-weight: 600; }
h3 { font-size: 12px; color: var(--mute); margin: 14px 0 6px; font-weight: 600; }
code { font-family: var(--mono); font-size: 12px; background: var(--soft); padding: 0 4px; border-radius: 4px; }
svg { width: 100%; height: auto; display: block; user-select: none; }
svg text { fill: var(--ink); font-family: system-ui, sans-serif; }
svg .mute { fill: var(--mute); }
svg .mono { font-family: var(--mono); }
.box { fill: var(--box); stroke: var(--line); stroke-width: 1.5; cursor: pointer; }
.box.ext { fill: var(--soft); }
.box.none { stroke-dasharray: 6 4; fill: transparent; }
.box.sel, .box.on { stroke: var(--hl); stroke-width: 2.5; }
.region { fill: none; stroke: var(--line); stroke-dasharray: 3 4; }
.edge { stroke: var(--line); stroke-width: 2; fill: none; cursor: pointer; }
.edge.hot { stroke: var(--wait); }
.edge.ok { stroke: var(--ok); } .edge.refused { stroke: var(--refused); } .edge.failed { stroke: var(--failed); }
.edge.on { stroke: var(--hl); stroke-width: 4; }
.edge.off { opacity: .25; }
.hit { stroke: transparent; stroke-width: 16; fill: none; cursor: pointer; }
.elabel { font-size: 11px; }
.olabel { font-size: 11px; fill: var(--hl) !important; font-weight: 650; }
.chip { fill: var(--hl); } .chip.dim { fill: var(--line); }
.chiptext { fill: #fff !important; font-size: 10px; font-weight: 650; }
.st-ready, .st-active { fill: var(--ok); } .st-starting, .st-stopping, .st-pending { fill: var(--wait); } .st-failed { fill: var(--failed); } .st-grace { fill: var(--refused); } .st-stopped, .st-gone, .st-login { fill: var(--mute); }
.legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--mute); margin-top: 8px; align-items: center; }
.frow { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 2px 8px; align-items: center; padding: 3px 8px; border-radius: 7px; cursor: pointer; }
.frow:hover { background: var(--soft); } .frow.sel { background: var(--glow); outline: 1px solid var(--hl); }
.frow .n, .mrow .n { font-family: var(--mono); color: var(--mute); font-size: 12px; text-align: right; }
.frow .c { font-family: var(--mono); color: var(--mute); font-size: 11px; }
.bar { height: 4px; background: var(--soft); border-radius: 2px; overflow: hidden; grid-column: 2 / 4; }
.bar i { display: block; height: 100%; background: var(--ok); }
.btns { display: flex; gap: 6px; margin: 8px 0; flex-wrap: wrap; }
button { font: inherit; font-size: 12px; padding: 4px 10px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); border-radius: 6px; cursor: pointer; }
button:hover { background: var(--soft); }
.seq { display: grid; gap: 3px; margin-top: 6px; max-height: 340px; overflow: auto; }
.srow { display: grid; grid-template-columns: 34px 92px minmax(0, 1fr); gap: 6px; align-items: baseline; font-size: 12px; padding: 3px 4px; border-radius: 5px; }
.srow.dim { opacity: .45; } .srow.cur { background: var(--glow); }
.srow .no { font-family: var(--mono); color: var(--mute); text-align: right; }
.where { font-family: var(--mono); font-size: 11px; color: var(--hl); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.what { color: var(--mute); }
.sub { color: var(--mute); font-size: 12px; margin: 4px 0; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }
.cchip { font-family: var(--mono); font-size: 11px; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--line); color: var(--mute); }
.cchip.built { color: var(--ink); border-color: var(--ok); }
.al { font-family: var(--mono); font-size: 11px; color: var(--mute); }
.empty { color: var(--mute); font-size: 12px; }
.srv { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 4px 6px; border-radius: 6px; font-size: 13px; cursor: pointer; }
.srv:hover { background: var(--soft); }
.mrow { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 6px; align-items: center; font-size: 12px; padding: 3px 6px; border-radius: 6px; cursor: pointer; }
.mrow:hover { background: var(--soft); }
.acts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.act { font-size: 11px; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--line); cursor: pointer; display: inline-flex; gap: 4px; align-items: center; }
.act:hover { background: var(--soft); } .act.sel { border-color: var(--hl); color: var(--hl); }
.ps { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; padding: 1px 7px; border-radius: 999px; border: 1px solid currentColor; white-space: nowrap; }
.ps.active { color: var(--ok); } .ps.pending { color: var(--wait); } .ps.grace { color: var(--refused); } .ps.gone, .ps.login, .ps.none { color: var(--mute); }
.inst { border: 1px solid var(--line); border-radius: 8px; margin: 8px 0; }
.inst .ih { display: flex; gap: 8px; align-items: center; padding: 6px 10px; border-bottom: 1px solid var(--line); background: var(--soft); border-radius: 8px 8px 0 0; font-size: 13px; }
.inst .ih .r { margin-left: auto; font-size: 11px; color: var(--mute); }
.prow { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 5px 10px; cursor: pointer; font-size: 13px; }
.prow:hover { background: var(--soft); } .prow.sel { background: var(--glow); box-shadow: inset 3px 0 0 var(--hl); }
.prow .nm { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prow .meta { grid-column: 2 / 4; font-size: 11px; color: var(--mute); margin-top: -2px; }
.filter { display: flex; gap: 6px; align-items: center; margin: 6px 0; flex-wrap: wrap; }
.filter input { font: inherit; font-size: 12px; padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--ink); min-width: 0; flex: 1 1 100%; }
.fchip { font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); cursor: pointer; }
.fchip.on { border-color: var(--hl); color: var(--hl); background: var(--glow); }
.life { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 8px 0; }
.life .s { font-size: 11px; padding: 2px 8px; border-radius: 6px; border: 1px dashed var(--line); color: var(--mute); }
.life .s.hit { border-style: solid; color: var(--ink); }
.life .s.now { border-color: var(--hl); background: var(--glow); color: var(--ink); font-weight: 650; }
.life .ar { color: var(--mute); font-size: 11px; }
.logwrap { max-height: 300px; overflow: auto; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
td, th { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { color: var(--mute); font-weight: 500; } td.mono { font-family: var(--mono); }
</style>
</head>
<body>
<header>
  <h1>서비스 관측</h1>
  <span class="views"><button id="vServer">서버</button><button id="vPeople">사람</button></span>
  <span class="pill" id="who">—</span>
  <span class="pill" id="conn"><span class="dot"></span>붙는 중</span>
  <span class="pill" id="total">흔적 0</span>
  <span class="pill" id="mode">—</span>
</header>
<main>
  <section class="panel">
    <svg id="map" viewBox="0 0 1080 680" role="img" aria-label="프로세스와 연결의 그림"></svg>
    <div class="legend" id="legend"></div>
  </section>
  <section class="panel side" id="side"></section>
  <section class="panel wide">
    <h2 id="underTitle"></h2>
    <div class="logwrap"><table><thead id="underHead"></thead><tbody id="under"></tbody></table></div>
  </section>
</main>
<script type="application/json" id="data">${data}</script>
<script>
(() => {
  const MAP = JSON.parse(document.getElementById('data').textContent);
  const NS = 'http://www.w3.org/2000/svg';
  const FLOW = new Map(MAP.flows.map((f) => [f.flow, f]));
  const STEP = new Map(); for (const f of MAP.flows) for (const s of f.steps) STEP.set(f.flow + '.' + s.step, s);
  const CONCEPT = new Map(MAP.concepts.map((c) => [c.name, c]));
  const NODE = new Map(MAP.nodes.map((n) => [n.id, n]));
  const PROCS = MAP.nodes.filter((n) => !n.external).map((n) => n.id);
  const PERSON = [2, 3, 8, 9, 10, 11], OPERATOR = [6]; // 트리거의 주인 — 그 밖은 기계
  const ownerOf = (flow) => PERSON.includes(flow) ? 'person' : OPERATOR.includes(flow) ? 'operator' : 'machine';
  const PSTATES = ['login', 'pending', 'active', 'grace', 'gone'];
  const PLABEL = { login: '로그인함', pending: '입장함', active: '접속 중', grace: '끊김', gone: '떠남' };
  const POS = {
    client: { x: 95, y: 330, w: 150, h: 92 }, operator: { x: 600, y: 52, w: 190, h: 56 },
    api: { x: 340, y: 200, w: 200, h: 104 }, gateway: { x: 340, y: 460, w: 200, h: 104 },
    control: { x: 620, y: 330, w: 210, h: 116 }, node: { x: 925, y: 200, w: 210, h: 104 },
    engine: { x: 925, y: 440, w: 230, h: 160 }, storage: { x: 620, y: 636, w: 600, h: 52 },
  };
  const LABEL = { api: 'API 서버', gateway: '게이트웨이', control: '컨트롤 플레인', node: '노드 에이전트', client: '클라이언트', engine: '엔진 프로세스', storage: '스토리지', operator: '운영자' };

  // ── 연결 — 그릴 짝(밖의 관측자는 이 페이지 자신이라 그리지 않는다)
  const EDGES = [];
  for (const l of MAP.links) for (const [a, b] of l.pairs) if (POS[a] && POS[b]) EDGES.push({ key: l.name + ':' + a + '-' + b, link: l, a, b, n: 0, last: null, at: 0, msgs: [] });
  const edgeOf = (x, y) => EDGES.find((e) => (e.a === x && e.b === y) || (e.a === y && e.b === x));
  const ADJ = new Map(PROCS.map((p) => [p, []]));
  for (const e of EDGES) if (ADJ.has(e.a) && ADJ.has(e.b)) { ADJ.get(e.a).push(e.b); ADJ.get(e.b).push(e.a); }
  function route(from, to) { // 프로세스 사이의 가장 짧은 길
    if (from === to) return [from];
    const prev = new Map([[from, null]]); const q = [from];
    while (q.length) { const c = q.shift(); for (const n of ADJ.get(c) || []) if (!prev.has(n)) { prev.set(n, c); if (n === to) { const p = [to]; let k = to; while (prev.get(k)) { k = prev.get(k); p.unshift(k); } return p; } q.push(n); } }
    return [from, to];
  }

  // ── 단계가 놓이는 곳
  function candidates(st) {
    if (!st) return [];
    if (st.role) { const r = st.role.trim(); if (PROCS.includes(r)) return [r]; return PROCS; }
    const c = st.concept && CONCEPT.get(st.concept);
    return c && c.processes.length ? c.processes : [];
  }
  function place(st, prev) { const c = candidates(st); if (!c.length) return prev || 'control'; return prev && c.includes(prev) ? prev : c[0]; }
  function outside(st, proc) { // 그 단계가 연결로 닿는 밖 — 닿는 개념에서
    const out = [];
    if (!st || !st.concept) return out;
    for (const l of MAP.links) if (l.touches.includes(st.concept)) for (const [a, b] of l.pairs) {
      if (a === proc && NODE.get(b) && NODE.get(b).external && POS[b]) out.push(b);
      if (b === proc && NODE.get(a) && NODE.get(a).external && POS[a]) out.push(a);
    }
    return [...new Set(out)];
  }
  /** 단계들을 차례로 놓는다 — [{label, proc, hops:[[a,b]...], ext:[id], dir}]. flow 가 0 이면 라벨마다 흐름 번호를 붙인다 */
  function lay(flow, steps) {
    let prev = null; let section = null; let lastRun = null; const out = [];
    steps.forEach((s, i) => {
      const fl = s.flow || flow;
      const st = STEP.get(fl + '.' + s.step) || s;
      if (!s.flow && st.section !== section) { section = st.section; if (i > 0) prev = null; } // 설계의 절(A · B …)은 따로 시작한다
      if (s.run && s.run !== lastRun) { lastRun = s.run; prev = null; } // 실행이 바뀌면 길도 새로
      const proc = place(st, prev);
      const hops = []; if (prev && prev !== proc) { const r = route(prev, proc); for (let k = 0; k + 1 < r.length; k++) hops.push([r[k], r[k + 1]]); }
      const ext = outside(st, proc);
      const dir = (i === 0 || (s.run && out.length && out[out.length - 1].s.run !== s.run)) ? 'in' : (s.end === 'wait' || /◇/.test(st.result || '')) ? 'out' : 'both';
      out.push({ s, st, step: s.step, label: (fl !== flow ? fl + '·' : '') + s.step, proc, hops, ext, dir });
      prev = proc;
    });
    return out;
  }
  const FLOWLAY = new Map(MAP.flows.map((f) => [f.flow, lay(f.flow, f.steps)]));
  const BUILTPROC = new Set(); for (const [, l] of FLOWLAY) for (const x of l) if (x.st.traced) BUILTPROC.add(x.proc);

  // ── 받은 것
  const params = new URLSearchParams(location.search);
  const froms = (params.get('from') || '').split(',').map((s) => s.trim().replace(/\\/$/, '')).filter(Boolean);
  const sources = (froms.length ? froms : ['']).map((base) => ({ base, open: false, metrics: null, units: new Map(), lastAt: 0 }));
  const stat = new Map(MAP.nodes.map((n) => [n.id, { n: 0, last: null, bad: 0, at: 0 }]));
  const runs = new Map(); const serverLog = []; let total = 0;
  const persons = new Map(); // 가명 → 사람
  const unknown = { n: 0, at: 0, entries: [] }; // 가명이 없는 사람의 실행 — 토큰 · 주체가 틀렸다
  const machine = new Map(); // 흐름 → { n, bad, at, last: run id }
  let view = location.hash === '#people' ? 'people' : 'server';
  let sel = { kind: null, id: null }; // 고른 마디 · 연결
  let overlay = null; // { kind: 'flow'|'run'|'person', flow, layout, label, cur }
  let pick = null; // 고른 사람의 가명
  let pfilter = 'all'; let query = '';
  let replay = null;

  function personOf(who) {
    let p = persons.get(who);
    if (!p) { p = { who, name: null, state: null, states: [], unit: null, sessions: [], entries: [], at: 0, last: null, edges: new Map() }; persons.set(who, p); }
    return p;
  }
  function count(edge, msg, p) {
    edge.n++; edge.last = msg.t.end; edge.at = Date.now(); edge.msgs.unshift(msg); if (edge.msgs.length > 12) edge.msgs.length = 12;
    if (p) p.edges.set(edge.key, (p.edges.get(edge.key) || 0) + 1);
  }
  function hit(id, t) { const s = stat.get(id); if (!s) return; s.n++; s.last = t; s.at = Date.now(); if (t.end === 'refused' || t.end === 'failed') s.bad++; }
  function addEntry(p, e) { p.entries.push(e); if (p.entries.length > 300) p.entries.shift(); if (e.t.at >= p.at) { p.at = e.t.at; p.last = e.t; } }

  function ingest(src, t, live) {
    src.lastAt = Math.max(src.lastAt, t.at); total++;
    const id = (src.base || '') + '|' + t.run;
    let r = runs.get(id); if (!r) { r = { id, run: t.run, flow: t.flow, owner: ownerOf(t.flow), traces: [], entries: [], prev: null, who: null, unit: null, bad: false }; runs.set(id, r); }
    if (t.unit && t.unit !== '-') r.unit = t.unit;
    if (t.end === 'refused' || t.end === 'failed') r.bad = true;
    if (r.owner === 'machine' && r.traces.length === 0) { const m = machine.get(r.flow) || { n: 0, bad: 0, at: 0, last: null }; m.n++; m.at = t.at; m.last = id; machine.set(r.flow, m); }
    if (r.owner === 'machine' && r.bad && !r.counted) { r.counted = true; machine.get(r.flow).bad++; }
    const st = STEP.get(t.flow + '.' + t.step);
    const proc = place(st, r.prev);
    const path = r.prev && r.prev !== proc ? route(r.prev, proc) : [proc];
    const ext = outside(st, proc);
    const first = r.traces.length === 0;
    const where = (path.length > 1 ? path.map((p) => LABEL[p]).join(' → ') : LABEL[proc]) + (ext.length ? ' ⇄ ' + ext.map((x) => LABEL[x]).join(' · ') : '');
    const entry = { t, where, run: id };
    // 누구의 것인가 — 흔적의 가명, 없으면 사람이 일으킨 실행의 가명. 실행의 가명이 처음 서면 그 앞의 흔적도 그 사람의 것이다
    let p = null;
    if (t.who) p = personOf(t.who);
    else if (r.owner === 'person' && r.who) p = personOf(r.who);
    if (t.who && r.owner === 'person' && !r.who) { r.who = t.who; for (const e of r.entries) if (!e.t.who) addEntry(p, e); }
    if (p) {
      if (t.name) p.name = t.name;
      if (t.session && !p.sessions.includes(t.session)) p.sessions.push(t.session);
      if (t.unit && t.unit !== '-') p.unit = t.unit;
      if (t.person) { p.state = t.person; p.states.push({ state: t.person, at: t.at }); }
      addEntry(p, entry);
    } else if (r.owner === 'person') { unknown.entries.unshift(entry); if (unknown.entries.length > 50) unknown.entries.length = 50; }
    if (r.owner === 'person' && r.traces.length === 0) r.unknownCounted = false;
    if (r.owner === 'person' && !r.who && t.end === 'refused' && !r.unknownCounted) { r.unknownCounted = true; unknown.n++; unknown.at = t.at; }
    for (let k = 0; k + 1 < path.length; k++) { const e = edgeOf(path[k], path[k + 1]); if (e) count(e, { t, where }, p); }
    for (const x of ext) { const e = edgeOf(proc, x); if (e) count(e, { t, where }, p); hit(x, t); }
    hit(proc, t);
    r.traces.push(t); r.entries.push(entry); r.at = t.at; r.end = t.end; r.prev = proc;
    if (t.unit !== '-' && (t.state !== undefined || t.counts !== undefined)) {
      const was = src.units.get(t.unit);
      src.units.set(t.unit, { unit: t.unit, state: t.state ?? (was ? was.state : null), counts: Object.assign({}, was && was.counts, t.counts), at: t.at });
    }
    const isPerson = !!p || r.owner === 'person';
    if (!isPerson) { serverLog.unshift(entry); if (serverLog.length > 300) serverLog.length = 300; }
    if (runs.size > 600) prune();
    if (live) {
      const show = view === 'server' ? !isPerson : isPerson && (!pick || (p && p.who === pick));
      if (show) {
        if (path.length > 1) fly(path, t.end);
        for (const x of ext) { const d = first ? 'in' : t.end === 'wait' ? 'out' : 'both'; if (d === 'in') fly([x, proc], t.end); else if (d === 'out') fly([proc, x], t.end); else { fly([proc, x], t.end); setTimeout(() => fly([x, proc], t.end), 380); } }
        pulse(proc);
      }
      if (overlay && overlay.kind === 'person' && p && p.who === overlay.who) showPerson(p.who, true);
    }
    schedule();
  }

  function prune() { // 기계의 실행은 흐름마다 마지막 것과 거절 · 실패만, 사람 · 운영자의 실행은 최근 400
    const keep = new Set([...machine.values()].map((m) => m.last));
    const all = [...runs.values()].sort((a, b) => b.at - a.at);
    let people = 0, badMachine = 0;
    for (const r of all) {
      if (r.owner === 'machine') { if (keep.has(r.id) || (r.bad && badMachine++ < 30)) continue; runs.delete(r.id); }
      else if (people++ >= 400) runs.delete(r.id);
    }
  }

  function connect(src) {
    const es = new EventSource((src.base || '') + '/observe');
    es.addEventListener('open', () => { src.open = true; schedule(); });
    es.addEventListener('error', () => { src.open = false; schedule(); });
    es.addEventListener('metrics', (e) => {
      const v = JSON.parse(e.data); const m = v.metrics || v;
      src.metrics = m; src.units = new Map(m.units.map((u) => [u.unit, u]));
      const since = src.lastAt;
      if (v.recent) for (const t of v.recent) if (t.at > since) ingest(src, t, false);
      schedule();
    });
    es.addEventListener('trace', (e) => ingest(src, JSON.parse(e.data), true));
  }

  // ── 그림
  const svg = document.getElementById('map');
  const el = (tag, attrs, parent) => { const x = document.createElementNS(NS, tag); for (const k in attrs) x.setAttribute(k, attrs[k]); (parent || svg).appendChild(x); return x; };
  const txt = (s, attrs, parent) => { const x = el('text', attrs, parent); x.textContent = s; return x; };
  function clip(p, q) { const P = POS[p], Q = POS[q]; const dx = Q.x - P.x, dy = Q.y - P.y; const s = Math.min(P.w / 2 / Math.abs(dx || 1e-9), P.h / 2 / Math.abs(dy || 1e-9)); return { x: P.x + dx * s, y: P.y + dy * s }; }
  function seg(a, b) { return [clip(a, b), clip(b, a)]; }
  const layers = { region: el('g', {}), edges: el('g', {}), boxes: el('g', {}), over: el('g', {}), flyer: el('g', {}) };

  function procState(id) {
    const node = NODE.get(id);
    if (node.external) return { cls: 'ext', text: '밖' };
    const ms = sources.filter((s) => s.metrics && (s.metrics.role === id || s.metrics.role === 'main'));
    if (!BUILTPROC.has(id)) return { cls: 'none', text: '설계만 — src 에 없다' };
    if (!ms.length) return { cls: 'down', text: '보고 없음', dot: 'failed' };
    const live = ms.filter((s) => s.open);
    if (!live.length) return { cls: 'down', text: '끊김', dot: 'failed' };
    const closing = live.some((s) => s.metrics.closing);
    const host = live.map((s) => s.metrics.role).includes(id) ? '' : 'main 에 조립 · ';
    return { cls: 'up', text: host + (closing ? '내려가는 중' : '듣는 중'), dot: closing ? 'refused' : 'ok' };
  }
  function allUnits() { const u = []; for (const s of sources) for (const x of s.units.values()) u.push(x); return u; }
  function conceptsOf(id) { return MAP.concepts.filter((c) => c.processes.includes(id) && c.processes.length < PROCS.length); }
  const peopleOn = (unit) => [...persons.values()].filter((p) => p.unit === unit && p.state === 'active').length;

  function draw() {
    for (const k in layers) layers[k].replaceChildren();
    const now = Date.now();
    el('rect', { class: 'region', x: 790, y: 118, width: 270, height: 414, rx: 14 }, layers.region);
    txt('노드 서버 × N', { x: 802, y: 136, class: 'mute', 'font-size': 11 }, layers.region);
    el('rect', { class: 'region', x: 226, y: 118, width: 228, height: 414, rx: 14 }, layers.region);
    txt('Edge 서버 × E', { x: 238, y: 136, class: 'mute', 'font-size': 11 }, layers.region);
    const ov = overlay ? overlayEdges() : null;
    const P = view === 'people' ? (pick ? persons.get(pick) : null) : null;
    const edgeN = (e) => view === 'server' ? e.n : P ? (P.edges.get(e.key) || 0) : [...persons.values()].reduce((a, p) => a + (p.edges.get(e.key) || 0), 0);
    for (const e of EDGES) {
      const [p, q] = seg(e.a, e.b);
      const used = ov && ov.edges.get(e.key);
      const n = edgeN(e);
      const cls = ['edge'];
      if (ov) cls.push(used ? 'on' : 'off'); else if (view === 'server' && e.last) cls.push(e.last === 'wait' ? 'hot' : e.last); else if (view === 'people' && n) cls.push('hot');
      if (sel.kind === 'edge' && sel.id === e.key) cls.push('on');
      el('line', { class: cls.join(' '), x1: p.x, y1: p.y, x2: q.x, y2: q.y, 'stroke-width': ov ? '' : String(Math.min(2 + Math.log2(1 + n), 7)) }, layers.edges);
      const h = el('line', { class: 'hit', x1: p.x, y1: p.y, x2: q.x, y2: q.y }, layers.edges);
      h.addEventListener('click', () => pickThing('edge', e.key));
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      const dup = EDGES.filter((x) => x.link === e.link).length > 1 && e.link.name !== 'Link';
      if (ov && used) txt(e.link.name + '  ' + used.join(' · '), { x: mx + 6, y: my - 6, class: 'olabel' }, layers.over);
      else if (!dup || e.a === 'control' || e.b === 'control') txt(e.link.name + (n ? ' · ' + n : ''), { x: mx + 6, y: my - 6, class: 'elabel mute' }, layers.edges);
      else if (n) txt(String(n), { x: mx + 6, y: my - 6, class: 'elabel mute' }, layers.edges);
    }
    const chipsAt = ov ? ov.chips : new Map();
    for (const id of Object.keys(POS)) {
      const B = POS[id]; const node = NODE.get(id); if (!node) continue;
      const g = el('g', {}, layers.boxes);
      const ps = procState(id); const s = stat.get(id);
      const cls = ['box']; if (node.external) cls.push('ext'); if (ps.cls === 'none') cls.push('none');
      if (sel.kind === 'node' && sel.id === id) cls.push('sel');
      if (s && s.at && now - s.at < 900) cls.push('on');
      const r = el('rect', { class: cls.join(' '), x: B.x - B.w / 2, y: B.y - B.h / 2, width: B.w, height: B.h, rx: 10 }, g);
      r.addEventListener('click', () => pickThing('node', id));
      const top = B.y - B.h / 2, left = B.x - B.w / 2;
      txt(LABEL[id] + (node.external ? '' : '  ' + id), { x: left + 12, y: top + 20, 'font-weight': 650, 'font-size': 14 }, g);
      if (!node.external) {
        if (ps.dot) el('circle', { cx: left + 16, cy: top + 37, r: 4.5, class: 'st-' + (ps.dot === 'ok' ? 'ready' : ps.dot === 'failed' ? 'failed' : 'starting') }, g);
        txt(ps.text, { x: left + (ps.dot ? 26 : 12), y: top + 41, class: 'mute', 'font-size': 12 }, g);
        const cs = conceptsOf(id);
        txt('개념 ' + cs.filter((c) => c.built).length + ' / ' + cs.length + ' 섰다 · 단계 ' + (s ? s.n : 0), { x: left + 12, y: top + 60, class: 'mute', 'font-size': 12 }, g);
        if (s && s.last) txt('최근 ' + s.last.flow + '·' + s.last.step + ' ' + whoOf(s.last), { x: left + 12, y: top + 79, class: 'mono', 'font-size': 11 }, g);
      }
      if (id === 'client') {
        const ps2 = [...persons.values()];
        txt('접속 중 ' + ps2.filter((p) => p.state === 'active').length, { x: left + 12, y: top + 44, 'font-size': 12 }, g);
        txt('사람 ' + ps2.length + ' · 요청 · 글 ' + (s ? s.n : 0), { x: left + 12, y: top + 63, class: 'mute', 'font-size': 12 }, g);
      }
      if (id === 'storage' || id === 'operator') txt('닿은 단계 ' + (s ? s.n : 0), { x: B.x + B.w / 2 - 12, y: top + 20, class: 'mute', 'font-size': 12, 'text-anchor': 'end' }, g);
      if (id === 'engine') drawUnits(B, g);
      const chips = chipsAt.get(id);
      if (chips) {
        let cx = left, cy = B.y + B.h / 2 + 6;
        for (const c of chips) {
          const w = 10 + 6.5 * c.label.length;
          if (cx + w > B.x + B.w / 2 + 40) { cx = left; cy += 21; }
          el('rect', { x: cx, y: cy, width: w, height: 17, rx: 8.5, class: 'chip' + (c.dim ? ' dim' : '') }, layers.over);
          txt(c.label, { x: cx + w / 2, y: cy + 12.5, class: 'chiptext', 'text-anchor': 'middle' }, layers.over);
          if (overlay && overlay.cur === c.key) el('rect', { x: cx - 3, y: cy - 3, width: w + 6, height: 23, rx: 11, fill: 'none', stroke: 'var(--hl)', 'stroke-width': 2 }, layers.over);
          cx += w + 4;
        }
      }
    }
  }
  function drawUnits(B, g) {
    const us = allUnits(); const x0 = B.x - B.w / 2 + 12; let y = B.y - B.h / 2 + 38;
    const mine = view === 'people' && pick && persons.get(pick) ? persons.get(pick).unit : null;
    if (!us.length) { txt('인스턴스 없음 — 입장이 띄운다', { x: x0, y: y + 6, class: 'mute', 'font-size': 12 }, g); return; }
    for (const u of us.slice(0, 4)) {
      el('rect', { x: x0, y: y - 12, width: B.w - 24, height: 26, rx: 6, fill: 'var(--panel)', stroke: mine === u.unit ? 'var(--hl)' : 'var(--line)', 'stroke-width': mine === u.unit ? 2 : 1 }, g);
      el('circle', { cx: x0 + 12, cy: y + 1, r: 5, class: 'st-' + (u.state || 'stopped') }, g);
      txt(u.unit + '  ' + (u.state || '-'), { x: x0 + 24, y: y + 5, 'font-size': 12, 'font-weight': 600 }, g);
      const c = u.counts || {};
      txt(['사람 ' + (c.players ?? 0), c.port !== undefined ? ':' + c.port : ''].filter(Boolean).join(' · '), { x: x0 + B.w - 36, y: y + 5, class: 'mute mono', 'font-size': 11, 'text-anchor': 'end' }, g);
      y += 31;
    }
    if (us.length > 4) txt('+' + (us.length - 4) + ' 더', { x: x0, y: y + 4, class: 'mute', 'font-size': 11 }, g);
    txt('호스트 + NPC 에이전트 · 인스턴스마다', { x: x0, y: B.y + B.h / 2 - 10, class: 'mute', 'font-size': 11 }, g);
  }
  function whoOf(t) { const st = STEP.get(t.flow + '.' + t.step); return st ? st.who.replace(/\\x60/g, '') : '?'; }

  function overlayEdges() {
    const edges = new Map(); const chips = new Map();
    for (const x of overlay.layout) {
      const dim = overlay.kind === 'flow' && !x.st.traced;
      if (!chips.has(x.proc)) chips.set(x.proc, []);
      const list = chips.get(x.proc);
      if (!list.some((c) => c.label === x.label)) list.push({ label: x.label, key: x.key || x.label, dim });
      const add = (a, b) => { const e = edgeOf(a, b); if (!e) return; if (!edges.has(e.key)) edges.set(e.key, []); const l = edges.get(e.key); if (!l.includes(x.label)) l.push(x.label); };
      for (const [a, b] of x.hops) add(a, b);
      for (const o of x.ext) add(x.proc, o);
    }
    for (const [k, l] of edges) if (l.length > 8) edges.set(k, [...l.slice(0, 7), '… ' + (l.length - 7)]);
    return { edges, chips };
  }

  // 글이 연결을 따라 움직인다
  const flying = [];
  function fly(path, end) {
    const pts = []; for (let k = 0; k + 1 < path.length; k++) { const [p, q] = seg(path[k], path[k + 1]); pts.push(p, q); }
    if (!pts.length) return;
    flying.push({ pts, t0: performance.now(), dur: 520 * (pts.length / 2), end });
    if (flying.length > 60) flying.splice(0, flying.length - 60);
  }
  function pulse(id) { const s = stat.get(id); if (s) s.at = Date.now(); }
  function frame(now) {
    layers.flyer.replaceChildren();
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i]; const k = Math.max(0, (now - f.t0) / f.dur); // rAF 의 때는 글이 난 때보다 앞설 수 있다
      if (k >= 1) { flying.splice(i, 1); continue; }
      const segs = f.pts.length / 2; const at = Math.min(segs - 1e-6, k * segs); const si = Math.floor(at); const u = at - si;
      const p = f.pts[si * 2], q = f.pts[si * 2 + 1];
      el('circle', { cx: p.x + (q.x - p.x) * u, cy: p.y + (q.y - p.y) * u, r: 6, class: 'st-' + (f.end === 'ok' ? 'ready' : f.end === 'wait' ? 'starting' : f.end === 'refused' ? 'grace' : 'failed'), opacity: 0.9 }, layers.flyer);
    }
    requestAnimationFrame(frame);
  }

  // ── 글
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const md = (s) => esc(s).replace(/\\x60([^\\x60]+)\\x60/g, '<code>$1</code>');
  const time = (at) => new Date(at).toLocaleTimeString('ko-KR', { hour12: false }) + '.' + String(at % 1000).padStart(3, '0');
  const kv = (o) => Object.entries(o || {}).map(([k, v]) => k + ' ' + v).join(' · ');
  const ago = (at) => { const d = Math.max(0, Math.round((Date.now() - at) / 1000)); return d < 60 ? d + '초 전' : d < 3600 ? Math.round(d / 60) + '분 전' : Math.round(d / 3600) + '시간 전'; };
  const flowName = (n) => (FLOW.get(n) ? FLOW.get(n).name : '흐름 ' + n);
  const nameOf = (p) => p.name || '가명 ' + p.who;
  const pstate = (s) => '<span class="ps ' + (s || 'none') + '"><span class="dot ' + (s === 'active' ? 'ok' : s === 'pending' ? 'wait' : s === 'grace' ? 'refused' : '') + '"></span>' + esc(s ? PLABEL[s] : '모름') + '</span>';

  function seqHtml(layout, kind) {
    return '<div class="seq">' + layout.map((x) => {
      const dim = kind === 'flow' && !x.st.traced;
      const where = LABEL[x.proc] + (x.hops.length ? ' ←' + LABEL[x.hops[0][0]].split(' ')[0] : '') + (x.ext.length ? ' ⇄ ' + x.ext.map((e) => LABEL[e]).join('·') : '');
      return '<div class="srow' + (dim ? ' dim' : '') + (overlay && overlay.cur === (x.key || x.label) ? ' cur' : '') + '"><span class="no">' + x.label + '</span><span class="where" title="' + esc(where) + '">' + esc(where) + '</span><span><b>' + md(x.st.who || '') + '</b> <span class="what">' + md(x.st.what || '') + '</span>' + (x.s.end ? ' <span class="dot ' + x.s.end + '"></span>' : '') + '</span></div>';
    }).join('') + '</div>';
  }
  function flowListHtml(nums, title) {
    return '<h3>' + title + '</h3>' + nums.map((n) => {
      const f = FLOW.get(n); if (!f) return '';
      const t = f.steps.filter((s) => s.traced).length;
      return '<div class="frow' + (overlay && overlay.kind === 'flow' && overlay.flow === n ? ' sel' : '') + '" data-flow="' + n + '"><span class="n">' + n + '</span><span>' + esc(f.name) + '</span><span class="c">' + t + ' / ' + f.steps.length + '</span><span class="bar"><i style="width:' + Math.round((100 * t) / Math.max(1, f.steps.length)) + '%"></i></span></div>';
    }).join('');
  }
  function overlayHtml() {
    if (!overlay) return '';
    let h = '';
    if (overlay.kind === 'person') {
      h += '<h2>그 사람의 길 — 최근 실행들</h2>';
    } else {
      const f = FLOW.get(overlay.flow);
      h += '<h2>' + (overlay.kind === 'flow' ? '흐름의 길 — 설계' : '실행의 길 — 실제로 지나간 것') + '</h2>';
      h += '<p><b>흐름 ' + f.flow + '. ' + esc(f.name) + '</b> <span class="sub">' + md(f.title) + '</span></p><p class="sub">트리거: ' + md(f.trigger) + '</p>';
      if (overlay.kind === 'flow') h += '<p class="sub">지금 코드가 도는 단계 ' + f.steps.filter((s) => s.traced).length + ' / ' + f.steps.length + ' — 흐린 줄은 아직 없다</p>';
      else h += '<p class="sub">run ' + esc(overlay.label) + ' · 단계 ' + overlay.layout.length + (overlay.unit ? ' · 인스턴스 ' + esc(overlay.unit) : '') + '</p>';
    }
    h += '<div class="btns"><button data-act="play">재생</button><button data-act="clear">길 지우기</button></div>';
    return h + seqHtml(overlay.layout, overlay.kind);
  }

  // 서버 보기의 옆 판
  function serverSide() {
    let h = '';
    if (sel.kind === 'node') {
      const n = NODE.get(sel.id); const ps = procState(sel.id); const s = stat.get(sel.id);
      h += '<h2>마디</h2><p><b>' + esc(LABEL[sel.id] || n.name) + '</b> <code>' + esc(n.id) + '</code> <span class="sub">' + esc(ps.text) + '</span></p>';
      if (!n.external) h += '<p class="sub">듣는 것: ' + md(n.listens) + '</p><p class="sub">상태: ' + md(n.holds) + '</p><p class="sub">늘리는 법: ' + md(n.scale) + '</p>';
      const cs = conceptsOf(sel.id);
      if (cs.length) h += '<p class="sub">사는 개념 — 테가 초록이면 src 에 섰다</p><div class="chips">' + cs.map((c) => '<span class="cchip' + (c.built ? ' built' : '') + '" title="' + esc(c.duty) + '">' + esc(c.name) + '</span>').join('') + '</div>';
      h += '<p class="sub">지금까지 지난 단계 ' + (s ? s.n : 0) + (s && s.bad ? ' · 거절 · 실패 ' + s.bad : '') + '</p>';
    } else if (sel.kind === 'edge') {
      const e = EDGES.find((x) => x.key === sel.id);
      h += '<h2>연결</h2><p><b>' + esc(e.link.name) + '</b> <span class="sub">' + esc(LABEL[e.a]) + ' — ' + esc(LABEL[e.b]) + '</span></p>';
      h += '<p class="sub">방향: ' + md(e.link.direction) + '</p><p class="sub">싣는 것: ' + md(e.link.carries) + '</p>';
      if (e.link.touches.length) h += '<p class="sub">닿는 개념: ' + esc(e.link.touches.join(' · ')) + '</p>';
      h += '<p class="sub">넘은 흔적 ' + e.n + '</p>' + e.msgs.map((m) => '<p class="sub"><span class="dot ' + m.t.end + '"></span> ' + time(m.t.at) + ' 흐름 ' + m.t.flow + '·' + m.t.step + ' ' + md(whoOf(m.t)) + '</p>').join('');
    }
    h += overlayHtml();
    h += '<h3>프로세스</h3>' + PROCS.map((id) => { const ps = procState(id); const s = stat.get(id);
      return '<div class="srv" data-node="' + id + '"><span class="dot ' + (ps.dot || '') + '"></span><span><b>' + esc(LABEL[id]) + '</b> <span class="al">' + id + '</span> <span class="sub">' + esc(ps.text) + '</span></span><span class="al">단계 ' + (s ? s.n : 0) + '</span></div>'; }).join('');
    const us = allUnits();
    h += '<h3>인스턴스 ' + us.length + '</h3>' + (us.length ? us.map((u) => '<div class="srv" data-node="engine"><span class="dot ' + (u.state === 'ready' ? 'ok' : u.state === 'failed' ? 'failed' : u.state === 'stopped' ? '' : 'wait') + '"></span><span><b>' + esc(u.unit) + '</b> <span class="sub">' + esc(u.state || '-') + '</span><br><span class="al">' + esc(kv(u.counts)) + '</span></span><span class="al">접속 중 ' + peopleOn(u.unit) + '</span></div>').join('') : '<p class="empty">인스턴스 없음 — 입장이 띄운다</p>');
    const ops = [...runs.values()].filter((r) => r.owner === 'operator').sort((a, b) => b.at - a.at);
    h += '<h3>운영자의 명령 ' + ops.length + '</h3>' + (ops.length ? '<div class="acts">' + ops.slice(0, 20).map(actHtml).join('') + '</div>' : '<p class="empty">명령이 없었다</p>');
    const ms = [...machine.entries()].sort((a, b) => a[0] - b[0]);
    h += '<h3>기계의 흐름 — 흐름마다의 셈</h3>' + (ms.length ? ms.map(([fl, m]) => '<div class="mrow" data-run="' + esc(m.last) + '"><span class="n">' + fl + '</span><span>' + esc(flowName(fl)) + ' · ' + m.n + '번' + (m.bad ? ' · <span style="color:var(--failed)">거절 · 실패 ' + m.bad + '</span>' : '') + '</span><span class="al">' + ago(m.at) + '</span></div>').join('') : '<p class="empty">아직 없다</p>');
    const bad = [...runs.values()].filter((r) => r.owner === 'machine' && r.bad).sort((a, b) => b.at - a.at).slice(0, 10);
    if (bad.length) h += '<div class="acts">' + bad.map(actHtml).join('') + '</div>';
    h += flowListHtml(MAP.flows.map((f) => f.flow).filter((n) => !PERSON.includes(n)), '서버의 흐름 — 고르면 그 길이 그림 위에 놓인다');
    return h;
  }
  function actHtml(r) {
    return '<span class="act' + (overlay && overlay.kind === 'run' && overlay.id === r.id ? ' sel' : '') + '" data-run="' + esc(r.id) + '" title="run ' + esc(r.run) + '"><span class="dot ' + r.end + '"></span>' + esc(flowName(r.flow)) + (r.unit ? ' · ' + esc(r.unit) : '') + ' <span class="al">' + ago(r.at) + '</span></span>';
  }

  // 사람 보기의 옆 판
  function peopleSide() {
    const all = [...persons.values()];
    const by = (s) => all.filter((p) => p.state === s).length;
    let h = '';
    if (pick && persons.get(pick)) {
      const p = persons.get(pick);
      h += '<h2>고른 사람</h2><p style="margin:2px 0"><b style="font-size:16px">' + esc(nameOf(p)) + '</b> ' + (p.name ? '<span class="al">' + esc(p.who) + '</span> ' : '') + pstate(p.state) + '</p>';
      h += '<p class="sub">인스턴스 ' + esc(p.unit || '없음') + ' · 세션 ' + (p.sessions.length ? p.sessions.map(esc).join(' · ') : '없음') + ' · 마지막 ' + (p.last ? esc(flowName(p.last.flow)) + ' ' + ago(p.at) : '-') + '</p>';
      const reached = new Map(); for (const s of p.states) reached.set(s.state, s.at);
      h += '<div class="life">' + PSTATES.map((s, i) => (i ? '<span class="ar">→</span>' : '') + '<span class="s' + (reached.has(s) ? ' hit' : '') + (p.state === s ? ' now' : '') + '" title="' + (reached.has(s) ? time(reached.get(s)) : '아직') + '">' + PLABEL[s] + '</span>').join('') + '</div>';
      h += '<div class="btns"><button data-act="play">이 사람의 길 재생</button><button data-act="unpick">고름 풀기</button></div>';
    } else h += '<h2>사람 — 고르면 그림에 그 사람의 길만, 아래에 그 사람의 일생</h2>';
    h += '<div class="filter"><input id="q" type="search" placeholder="캐릭터 이름 · 가명 · 세션 · 인스턴스로 찾기" aria-label="찾기" value="' + esc(query) + '">'
      + [['all', '전체 ' + all.length], ['active', '접속 중 ' + by('active')], ['pending', '입장함 ' + by('pending')], ['login', '로그인함 ' + by('login')], ['grace', '끊김 ' + by('grace')], ['gone', '떠남 ' + by('gone')]].map(([k, l]) => '<span class="fchip' + (pfilter === k ? ' on' : '') + '" data-pf="' + k + '">' + l + '</span>').join('') + '</div>';
    const ok = (p) => (pfilter === 'all' || p.state === pfilter) && (!query || [p.name, p.who, p.unit, ...p.sessions].some((x) => x && String(x).toLowerCase().includes(query)));
    const groups = new Map();
    for (const p of all.filter(ok)) { const k = p.unit || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
    const units = new Map(allUnits().map((u) => [u.unit, u]));
    const keys = [...groups.keys()].sort((a, b) => (a === '' ? 1 : 0) - (b === '' ? 1 : 0) || a.localeCompare(b));
    if (!keys.length) h += '<p class="empty">' + (all.length ? '맞는 사람이 없다' : '아직 사람이 없다 — 로그인 · 입장이 오면 선다') + '</p>';
    for (const k of keys) {
      const list = groups.get(k).sort((a, b) => PSTATES.indexOf(a.state) - PSTATES.indexOf(b.state) || b.at - a.at);
      const u = units.get(k);
      h += '<div class="inst"><div class="ih">' + (k ? '<span class="dot ' + (u && u.state === 'ready' ? 'ok' : u && u.state === 'failed' ? 'failed' : 'wait') + '"></span><b>' + esc(k) + '</b> <span class="al">' + esc(u ? u.state || '' : '') + '</span>' : '<b>인스턴스 없음</b> <span class="al">로그인만 했다</span>') + '<span class="r">접속 중 ' + list.filter((p) => p.state === 'active').length + ' / ' + list.length + '</span></div>';
      h += list.slice(0, 80).map((p) => '<div class="prow' + (pick === p.who ? ' sel' : '') + '" data-who="' + esc(p.who) + '">' + pstate(p.state) + '<span class="nm">' + esc(nameOf(p)) + (p.name ? ' <span class="al">' + esc(p.who) + '</span>' : '') + '</span><span class="al">' + ago(p.at) + '</span><span class="meta">' + (p.sessions.length ? '세션 ' + esc(p.sessions[p.sessions.length - 1]) + ' · ' : '') + '마지막 ' + (p.last ? esc(flowName(p.last.flow)) + ' ' + p.last.flow + '·' + p.last.step : '-') + '</span></div>').join('');
      h += '</div>';
    }
    if (unknown.n) h += '<div class="inst"><div class="ih"><b>누군지 모름</b> <span class="al">토큰 · 주체가 틀린 요청</span><span class="r">' + unknown.n + '번 · ' + ago(unknown.at) + '</span></div></div>';
    h += overlay && overlay.kind !== 'person' ? overlayHtml() : '';
    h += flowListHtml(PERSON, '사람의 흐름 — 고르면 그 길이 그림 위에 놓인다');
    return h;
  }

  function renderSide() {
    const side = document.getElementById('side');
    const q = document.getElementById('q'); const focused = q && document.activeElement === q; const caret = q ? q.selectionStart : 0;
    const top = side.scrollTop;
    side.innerHTML = view === 'server' ? serverSide() : peopleSide();
    side.scrollTop = top;
    if (focused) { const nq = document.getElementById('q'); if (nq) { nq.focus(); nq.setSelectionRange(caret, caret); } }
  }

  function renderUnder() {
    const head = document.getElementById('underHead'), body = document.getElementById('under'), title = document.getElementById('underTitle');
    const row = (e, cols) => '<tr>' + cols.map((c) => '<td' + (c[1] ? ' class="mono"' : '') + '>' + c[0] + '</td>').join('') + '</tr>';
    const end = (t) => '<span class="dot ' + t.end + '"></span> ' + t.end;
    if (view === 'server') {
      title.textContent = '서버의 글 — 사람이 일으키지 않은 흐름. 최근 것이 위';
      head.innerHTML = '<tr><th>때</th><th>흐름 · #</th><th>단계</th><th>어디서 · 어디로</th><th>단위</th><th>끝</th><th>state · 수</th></tr>';
      body.innerHTML = serverLog.slice(0, 150).map((e) => { const t = e.t; return row(e, [[time(t.at), 1], [t.flow + ' · ' + t.step, 1], [md(whoOf(t))], [esc(e.where)], [esc(t.unit)], [end(t)], [esc([t.state, kv(t.counts)].filter(Boolean).join(' · ')), 1]]); }).join('');
      return;
    }
    const p = pick && persons.get(pick);
    if (p) {
      title.textContent = nameOf(p) + ' 의 일생 — 그 사람이 지나간 흐름의 단계, 처음부터';
      head.innerHTML = '<tr><th>때</th><th>흐름</th><th>#</th><th>단계</th><th>어디서 · 어디로</th><th>단위</th><th>끝</th><th>사람의 state</th><th>세션</th></tr>';
      const es = [...p.entries].sort((a, b) => a.t.at - b.t.at);
      body.innerHTML = es.map((e) => { const t = e.t; return row(e, [[time(t.at), 1], [esc(flowName(t.flow))], [t.flow + ' · ' + t.step, 1], [md(whoOf(t))], [esc(e.where)], [esc(t.unit)], [end(t)], [t.person ? pstate(t.person) : ''], [esc(t.session || ''), 1]]); }).join('');
      return;
    }
    title.textContent = '사람의 글 — 최근 것이 위';
    head.innerHTML = '<tr><th>때</th><th>누구</th><th>흐름 · #</th><th>단계</th><th>어디서 · 어디로</th><th>단위</th><th>끝</th><th>사람의 state</th></tr>';
    const es = []; for (const q of persons.values()) for (const e of q.entries) es.push([q, e]);
    es.sort((a, b) => b[1].t.at - a[1].t.at);
    body.innerHTML = es.slice(0, 150).map(([q, e]) => { const t = e.t; return row(e, [[time(t.at), 1], [esc(nameOf(q))], [t.flow + ' · ' + t.step, 1], [md(whoOf(t))], [esc(e.where)], [esc(t.unit)], [end(t)], [t.person ? pstate(t.person) : '']]); }).join('');
  }

  function renderHead() {
    const m = sources.map((s) => s.metrics).filter(Boolean);
    document.getElementById('who').textContent = m.length === 0 ? '—' : m.map((x) => 'Monitor ' + x.role + ' · build ' + x.build).join(' / ');
    const open = sources.filter((s) => s.open).length, closing = m.some((x) => x.closing);
    const dot = open === sources.length ? (closing ? 'refused' : 'ok') : 'failed';
    document.getElementById('conn').innerHTML = '<span class="dot ' + dot + '"></span>' + (open === sources.length ? (closing ? '내려가는 중' : '듣는 중') : '끊김 — 다시 붙는다');
    document.getElementById('total').textContent = '흔적 ' + total;
    const active = [...persons.values()].filter((p) => p.state === 'active').length;
    document.getElementById('vServer').textContent = '서버 · 인스턴스 ' + allUnits().length;
    document.getElementById('vPeople').textContent = '사람 · 접속 중 ' + active + ' / ' + persons.size;
    document.getElementById('vServer').className = view === 'server' ? 'on' : '';
    document.getElementById('vPeople').className = view === 'people' ? 'on' : '';
    document.getElementById('mode').textContent = overlay ? (overlay.kind === 'flow' ? '흐름 ' + overlay.flow + ' 의 길' : overlay.kind === 'person' ? '그 사람의 길' : '실행의 길') : view === 'server' ? '서버의 글이 움직인다' : pick ? '그 사람의 글이 움직인다' : '사람의 글이 움직인다';
    document.getElementById('legend').innerHTML = (view === 'server'
      ? '<span>상자 = 프로세스 · 밖</span><span>점선 상자 = 설계에만 있다</span><span>선의 수 = 넘은 흔적 전부</span>'
      : '<span>사람 보기 — 선의 수와 움직이는 글은 ' + (pick ? '고른 사람의 것' : '사람의 것') + '만</span><span>보라 테 = 그 사람의 인스턴스</span>')
      + '<span><span class="dot ok"></span> ok</span><span><span class="dot wait"></span> wait</span><span><span class="dot refused"></span> refused</span><span><span class="dot failed"></span> failed</span>';
  }

  // ── 고르기
  function pickThing(kind, id) { if (view !== 'server') setView('server'); overlay = null; stopReplay(); sel = sel.kind === kind && sel.id === id ? { kind: null, id: null } : { kind, id }; schedule(); }
  function showFlow(n) { overlay = { kind: 'flow', flow: n, layout: FLOWLAY.get(n), cur: null }; sel = { kind: null, id: null }; stopReplay(); schedule(); }
  function showRun(id) { const r = runs.get(id); if (!r) return; overlay = { kind: 'run', id, flow: r.flow, label: r.run, unit: r.unit, layout: lay(r.flow, r.traces), cur: null }; stopReplay(); schedule(); }
  function showPerson(who, keep) {
    const p = persons.get(who); if (!p) return;
    const es = [...p.entries].sort((a, b) => a.t.at - b.t.at).slice(-40);
    const layout = lay(0, es.map((e) => Object.assign({}, e.t, { run: e.run })));
    layout.forEach((x, i) => (x.key = x.label + '#' + i));
    if (!keep) stopReplay();
    overlay = { kind: 'person', who, layout, cur: keep && overlay ? overlay.cur : null };
    schedule();
  }
  function setView(v) { view = v; overlay = null; sel = { kind: null, id: null }; stopReplay(); if (v === 'people' && pick) showPerson(pick); history.replaceState(null, '', v === 'people' ? '#people' : '#'); schedule(); }
  function startReplay() {
    stopReplay(); if (!overlay) return; let i = 0; const L = overlay.layout;
    replay = setInterval(() => {
      if (!overlay || i >= L.length) { stopReplay(); return; }
      const x = L[i++]; overlay.cur = x.key || x.label;
      const end = x.s.end || (x.st.traced ? 'ok' : 'wait');
      if (x.hops.length) fly([x.hops[0][0], ...x.hops.map((h) => h[1])], end);
      for (const o of x.ext) { if (x.dir === 'in') fly([o, x.proc], end); else if (x.dir === 'out') fly([x.proc, o], end); else { fly([x.proc, o], end); setTimeout(() => fly([o, x.proc], end), 380); } }
      pulse(x.proc); schedule();
    }, 650);
  }
  function stopReplay() { if (replay) clearInterval(replay); replay = null; if (overlay) overlay.cur = null; }

  document.getElementById('vServer').onclick = () => setView('server');
  document.getElementById('vPeople').onclick = () => setView('people');
  const side = document.getElementById('side');
  side.addEventListener('click', (e) => {
    const a = e.target.closest('[data-act]');
    if (a) { const k = a.dataset.act; if (k === 'play') startReplay(); if (k === 'clear') { overlay = null; stopReplay(); } if (k === 'unpick') { pick = null; overlay = null; stopReplay(); } schedule(); return; }
    const w = e.target.closest('[data-who]'); if (w) { pick = pick === w.dataset.who ? null : w.dataset.who; if (pick) showPerson(pick); else { overlay = null; schedule(); } return; }
    const pf = e.target.closest('[data-pf]'); if (pf) { pfilter = pf.dataset.pf; schedule(); return; }
    const f = e.target.closest('[data-flow]'); if (f) { const n = Number(f.dataset.flow); if (overlay && overlay.kind === 'flow' && overlay.flow === n) { overlay = null; schedule(); } else showFlow(n); return; }
    const r = e.target.closest('[data-run]'); if (r) { showRun(r.dataset.run); return; }
    const nd = e.target.closest('[data-node]'); if (nd) pickThing('node', nd.dataset.node);
  });
  side.addEventListener('input', (e) => { if (e.target.id === 'q') { query = e.target.value.trim().toLowerCase(); schedule(); } });

  let queued = false;
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(render); } }
  function render() { queued = false; renderHead(); draw(); renderSide(); renderUnder(); }
  setInterval(schedule, 1000);
  sources.forEach(connect);
  render();
  requestAnimationFrame(frame);
})();
</script>
</body>
</html>
`;
}
