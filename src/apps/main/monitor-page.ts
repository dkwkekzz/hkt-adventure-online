// 관측 페이지 한 장 — Monitor.page 가 준다(흐름 14 의 3). 의존 없음 — 글 · CSS · 스크립트가 이 한 장에 든다.
// 그림은 구조 그대로다: 프로세스 넷(api · gateway · control · node)과 밖(클라이언트 · 엔진 · 스토리지 · 운영자), 그 사이의 연결.
//   마디  — 프로세스는 지금의 state(듣는 중 · 설계만 · 끊김)와 거기서 지난 단계의 수, 노드 서버 안에는 인스턴스(엔진 프로세스)의 state · 사람 수
//   연결  — 흔적이 넘은 수와 마지막 끝. 흔적이 지나갈 때 글 하나가 연결을 따라 움직인다
//   흐름  — 고르면 그 단계들이 구조 위에 놓인다: 마디마다 거기서 일어나는 # , 연결마다 그 사이를 넘는 # . 「재생」은 그 길을 차례로 보낸다
//   실행  — 트리거의 주인으로 가른다. 사람은 사람마다 한 줄(캐릭터 이름, 없으면 가명 · 세션 · 인스턴스), 운영자는 명령마다, 기계는 흐름마다의 셈(거절 · 실패만 줄로)
// 단계가 놓이는 곳은 관측의 지도(README 의 표)에서 — 개념이 사는 프로세스, 여럿이면 앞 단계와 같은 곳. 흐름 1 · 7 은 어느 role 칸.
// ?from=<주소>,<주소> 면 여러 Monitor 의 stream 을 함께 읽는다(비면 이 페이지의 자리).

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
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px; border: 1px solid var(--line); border-radius: 999px; font-size: 12px; color: var(--mute); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--mute); display: inline-block; flex: none; }
.dot.ok { background: var(--ok); } .dot.wait { background: var(--wait); } .dot.refused { background: var(--refused); } .dot.failed { background: var(--failed); }
main { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 12px; padding: 12px 16px; }
@media (max-width: 1100px) { main { grid-template-columns: minmax(0, 1fr); } }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px; min-width: 0; }
h2 { font-size: 12px; color: var(--mute); margin: 0 0 8px; font-weight: 600; }
code { font-family: var(--mono); font-size: 12px; background: var(--soft); padding: 0 4px; border-radius: 4px; }
svg { width: 100%; height: auto; display: block; user-select: none; }
svg text { fill: var(--ink); font-family: system-ui, sans-serif; }
svg .mute { fill: var(--mute); }
svg .mono { font-family: var(--mono); }
.box { fill: var(--box); stroke: var(--line); stroke-width: 1.5; cursor: pointer; }
.box.ext { fill: var(--soft); }
.box.none { stroke-dasharray: 6 4; fill: transparent; }
.box.sel { stroke: var(--hl); stroke-width: 2.5; }
.box.on { stroke: var(--hl); stroke-width: 2.5; }
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
.st-ready { fill: var(--ok); } .st-starting, .st-stopping { fill: var(--wait); } .st-failed { fill: var(--failed); } .st-stopped { fill: var(--mute); }
.legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--mute); margin-top: 8px; align-items: center; }
.flows { display: grid; gap: 0; }
.stick { position: sticky; top: 8px; align-self: start; }
@media (max-width: 1100px) { .stick { position: static; } }
.frow { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 2px 8px; align-items: center; padding: 3px 8px; border-radius: 7px; cursor: pointer; }
.frow:hover { background: var(--soft); } .frow.sel { background: var(--glow); outline: 1px solid var(--hl); }
.frow .n { font-family: var(--mono); color: var(--mute); font-size: 12px; text-align: right; }
.frow .c { font-family: var(--mono); color: var(--mute); font-size: 11px; }
.bar { height: 4px; background: var(--soft); border-radius: 2px; overflow: hidden; grid-column: 2 / 4; }
.bar i { display: block; height: 100%; background: var(--ok); }
.btns { display: flex; gap: 6px; margin: 8px 0; flex-wrap: wrap; }
button { font: inherit; font-size: 12px; padding: 4px 10px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); border-radius: 6px; cursor: pointer; }
button:hover { background: var(--soft); }
.seq { display: grid; gap: 3px; margin-top: 6px; max-height: 380px; overflow: auto; }
.srow { display: grid; grid-template-columns: 26px 92px minmax(0, 1fr); gap: 6px; align-items: baseline; font-size: 12px; padding: 3px 4px; border-radius: 5px; }
.srow.dim { opacity: .45; } .srow.cur { background: var(--glow); }
.srow .no { font-family: var(--mono); color: var(--mute); text-align: right; }
.where { font-family: var(--mono); font-size: 11px; color: var(--hl); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.what { color: var(--mute); }
.detail p { margin: 4px 0; } .detail .sub { color: var(--mute); font-size: 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }
.cchip { font-family: var(--mono); font-size: 11px; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--line); color: var(--mute); }
.cchip.built { color: var(--ink); border-color: var(--ok); }
.runs { display: grid; gap: 2px; max-height: 220px; overflow: auto; }
.run { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px; align-items: center; padding: 4px 6px; border-radius: 6px; cursor: pointer; font-size: 12px; }
.run:hover { background: var(--soft); } .run.sel { background: var(--glow); }
.run .p { font-family: var(--mono); font-size: 11px; color: var(--mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.empty { color: var(--mute); font-size: 12px; }
.person { padding: 6px 8px; border-radius: 7px; border: 1px solid transparent; }
.person:hover { background: var(--soft); } .person.sel { border-color: var(--hl); background: var(--glow); }
.person .top { display: flex; gap: 6px; align-items: center; font-size: 13px; }
.person .nm { font-weight: 650; } .al { font-family: var(--mono); font-size: 11px; color: var(--mute); }
.person .ago { margin-left: auto; font-size: 11px; color: var(--mute); }
.tag { font-family: var(--mono); font-size: 11px; padding: 0 6px; border-radius: 4px; background: var(--soft); color: var(--ink); cursor: pointer; }
.tag.inst { border: 1px solid var(--line); }
.acts { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.act { font-size: 11px; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--line); cursor: pointer; display: inline-flex; gap: 4px; align-items: center; }
.act:hover { background: var(--soft); } .act.sel { border-color: var(--hl); color: var(--hl); }
.machine { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 6px; align-items: center; font-size: 12px; padding: 3px 6px; border-radius: 6px; cursor: pointer; }
.machine:hover { background: var(--soft); }
.filter { display: flex; gap: 6px; align-items: center; margin: 6px 0; flex-wrap: wrap; }
.filter input { font: inherit; font-size: 12px; padding: 3px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--ink); min-width: 0; flex: 1; }
.sec2 { font-size: 12px; color: var(--mute); margin: 10px 0 4px; font-weight: 600; }
.log { grid-column: 1 / -1; }
.logwrap { max-height: 260px; overflow: auto; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
td, th { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { color: var(--mute); font-weight: 500; } td.mono { font-family: var(--mono); }
</style>
</head>
<body>
<header>
  <h1>서비스 관측</h1>
  <span class="pill" id="who">—</span>
  <span class="pill" id="conn"><span class="dot"></span>붙는 중</span>
  <span class="pill" id="total">흔적 0</span>
  <span class="pill" id="mode">실시간</span>
</header>
<main>
  <section class="panel stick">
    <svg id="map" viewBox="0 0 1080 680" role="img" aria-label="프로세스와 연결의 그림"></svg>
    <div class="legend">
      <span>상자 = 프로세스 · 밖</span><span>점선 상자 = 설계에만 있다(src 에 아직 없다)</span><span>선 = 연결 — 숫자는 넘은 흔적의 수</span>
      <span><span class="dot ok"></span> ok</span><span><span class="dot wait"></span> wait</span><span><span class="dot refused"></span> refused</span><span><span class="dot failed"></span> failed</span>
    </div>
  </section>
  <section class="panel">
    <div class="detail" id="detail"></div>
    <h2 style="margin-top:14px">실행 — 누가 무엇을 했나</h2>
    <div class="filter"><input id="q" type="search" placeholder="캐릭터 이름 · 가명 · 세션 · 인스턴스로 찾기" aria-label="찾기"><span id="only"></span></div>
    <div id="runs" style="max-height: 460px; overflow: auto"></div>
    <h2 style="margin-top:14px">흐름 — 고르면 그 길이 그림 위에 놓인다</h2>
    <div class="flows" id="flows"></div>
  </section>
  <section class="panel log">
    <h2>글 — 최근 것이 위</h2>
    <div class="logwrap"><table><thead><tr><th>때</th><th>흐름 · #</th><th>단계</th><th>누구</th><th>어디서 · 어디로</th><th>단위</th><th>끝</th><th>state · 수</th></tr></thead><tbody id="log"></tbody></table></div>
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
  const ENDS = ['ok', 'wait', 'refused', 'failed'];
  const PERSON = [2, 3, 8, 9, 10, 11], OPERATOR = [6]; // 트리거의 주인 — 그 밖은 기계
  const ownerOf = (flow) => PERSON.includes(flow) ? 'person' : OPERATOR.includes(flow) ? 'operator' : 'machine';
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
  /** 흐름의 단계를 차례로 놓는다 — [{step, proc, hops:[[a,b]...], ext:[id], dir}] */
  function lay(flow, steps) {
    let prev = null; let section = null; const out = [];
    steps.forEach((s, i) => {
      const fl = s.flow || flow;
      const st = STEP.get(fl + '.' + s.step) || s;
      if (!s.flow && st.section !== section) { section = st.section; if (i > 0) prev = null; } // 설계의 절(A · B …)은 따로 시작한다 — 절 사이를 넘는 길이 아니다
      const proc = place(st, prev);
      const hops = []; if (prev && prev !== proc) { const r = route(prev, proc); for (let k = 0; k + 1 < r.length; k++) hops.push([r[k], r[k + 1]]); }
      const ext = outside(st, proc);
      const dir = i === 0 ? 'in' : (s.end === 'wait' || /◇/.test(st.result || '')) ? 'out' : 'both';
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
  const stat = new Map([...MAP.nodes.map((n) => [n.id, { n: 0, last: null, bad: 0 }])]);
  const runs = new Map(); const log = []; let total = 0;
  let sel = { kind: null, id: null }; // 고른 마디 · 연결
  let overlay = null; // { kind: 'flow'|'run', flow, layout, label, cur }
  let only = null; // 인스턴스 하나로 거른다
  let query = '';
  const machine = new Map(); // 흐름 → { n, bad, at, last: run id }
  let replay = null;

  function count(edge, msg) { edge.n++; edge.last = msg.t.end; edge.at = Date.now(); edge.msgs.unshift(msg); if (edge.msgs.length > 12) edge.msgs.length = 12; }
  function hit(id, t) { const s = stat.get(id); if (!s) return; s.n++; s.last = t; s.at = Date.now(); if (t.end === 'refused' || t.end === 'failed') s.bad++; }

  function ingest(src, t, live) {
    src.lastAt = Math.max(src.lastAt, t.at); total++;
    const id = (src.base || '') + '|' + t.run;
    let r = runs.get(id); if (!r) { r = { id, run: t.run, flow: t.flow, owner: ownerOf(t.flow), traces: [], prev: null, who: null, name: null, session: null, unit: null, bad: false }; runs.set(id, r); }
    if (t.who) r.who = t.who; if (t.name) r.name = t.name; if (t.session) r.session = t.session; if (t.unit && t.unit !== '-') r.unit = t.unit;
    if (t.end === 'refused' || t.end === 'failed') r.bad = true;
    if (r.owner === 'machine' && r.traces.length === 0) { const m = machine.get(r.flow) || { n: 0, bad: 0, at: 0, last: null }; m.n++; m.at = t.at; m.last = id; machine.set(r.flow, m); }
    if (r.owner === 'machine' && (t.end === 'refused' || t.end === 'failed') && !r.counted) { r.counted = true; machine.get(r.flow).bad++; }
    const st = STEP.get(t.flow + '.' + t.step);
    const proc = place(st, r.prev);
    const path = r.prev && r.prev !== proc ? route(r.prev, proc) : [proc];
    const ext = outside(st, proc);
    const first = r.traces.length === 0;
    const where = path.length > 1 ? path.map((p) => LABEL[p]).join(' → ') : LABEL[proc];
    const msg = { t, where };
    for (let k = 0; k + 1 < path.length; k++) { const e = edgeOf(path[k], path[k + 1]); if (e) count(e, msg); }
    for (const x of ext) { const e = edgeOf(proc, x); if (e) count(e, msg); hit(x, t); }
    hit(proc, t);
    r.traces.push(t); r.at = t.at; r.end = t.end; r.prev = proc;
    if (t.unit !== '-' && (t.state !== undefined || t.counts !== undefined)) {
      const was = src.units.get(t.unit);
      src.units.set(t.unit, { unit: t.unit, state: t.state ?? (was ? was.state : null), counts: Object.assign({}, was && was.counts, t.counts), at: t.at });
    }
    log.unshift({ t, where: ext.length ? where + ' ⇄ ' + ext.map((x) => LABEL[x]).join(' · ') : where });
    if (log.length > 300) log.length = 300;
    if (runs.size > 600) prune();
    if (live) {
      if (path.length > 1) fly(path, t.end);
      for (const x of ext) { const d = first ? 'in' : t.end === 'wait' ? 'out' : 'both'; if (d === 'in') fly([x, proc], t.end); else if (d === 'out') fly([proc, x], t.end); else { fly([proc, x], t.end); setTimeout(() => fly([x, proc], t.end), 380); } }
      pulse(proc);
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

  function draw() {
    for (const k in layers) layers[k].replaceChildren();
    const now = Date.now();
    // 노드 서버 — 노드 에이전트와 그가 띄운 엔진 프로세스를 한 서버로 묶는다
    el('rect', { class: 'region', x: 790, y: 118, width: 270, height: 414, rx: 14 }, layers.region);
    txt('노드 서버 × N', { x: 802, y: 136, class: 'mute', 'font-size': 11 }, layers.region);
    el('rect', { class: 'region', x: 226, y: 118, width: 228, height: 414, rx: 14 }, layers.region);
    txt('Edge 서버 × E', { x: 238, y: 136, class: 'mute', 'font-size': 11 }, layers.region);
    const ov = overlay ? overlayEdges() : null;
    for (const e of EDGES) {
      const [p, q] = seg(e.a, e.b);
      const used = ov && ov.edges.get(e.key);
      const cls = ['edge'];
      if (ov) cls.push(used ? 'on' : 'off'); else { if (e.last) cls.push(e.last === 'wait' ? 'hot' : e.last); }
      if (sel.kind === 'edge' && sel.id === e.key) cls.push('on');
      el('line', { class: cls.join(' '), x1: p.x, y1: p.y, x2: q.x, y2: q.y, 'stroke-width': ov ? '' : String(Math.min(2 + Math.log2(1 + e.n), 7)) }, layers.edges);
      const h = el('line', { class: 'hit', x1: p.x, y1: p.y, x2: q.x, y2: q.y }, layers.edges);
      h.addEventListener('click', () => pick('edge', e.key));
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      const dup = EDGES.filter((x) => x.link === e.link).length > 1 && e.link.name !== 'Link';
      if (ov && used) {
        txt(e.link.name + '  ' + used.join(' · '), { x: mx + 6, y: my - 6, class: 'olabel' }, layers.over);
      } else if (!dup || e.a === 'control' || e.b === 'control') {
        txt(e.link.name + (e.n ? ' · ' + e.n : ''), { x: mx + 6, y: my - 6, class: 'elabel mute' }, layers.edges);
      } else if (e.n) txt(String(e.n), { x: mx + 6, y: my - 6, class: 'elabel mute' }, layers.edges);
    }
    const chipsAt = ov ? ov.chips : new Map();
    for (const id of Object.keys(POS)) {
      const P = POS[id]; const node = NODE.get(id); if (!node) continue;
      const g = el('g', {}, layers.boxes);
      const ps = procState(id); const s = stat.get(id);
      const cls = ['box']; if (node.external) cls.push('ext'); if (ps.cls === 'none') cls.push('none');
      if (sel.kind === 'node' && sel.id === id) cls.push('sel');
      if (s && s.at && now - s.at < 900) cls.push('on');
      const r = el('rect', { class: cls.join(' '), x: P.x - P.w / 2, y: P.y - P.h / 2, width: P.w, height: P.h, rx: 10 }, g);
      r.addEventListener('click', () => pick('node', id));
      const top = P.y - P.h / 2;
      txt(LABEL[id] + (node.external ? '' : '  ' + id), { x: P.x - P.w / 2 + 12, y: top + 20, 'font-weight': 650, 'font-size': 14 }, g).addEventListener('click', () => pick('node', id));
      if (!node.external) {
        if (ps.dot) el('circle', { cx: P.x - P.w / 2 + 16, cy: top + 37, r: 4.5, class: 'st-' + (ps.dot === 'ok' ? 'ready' : ps.dot === 'failed' ? 'failed' : 'starting') }, g);
        txt(ps.text, { x: P.x - P.w / 2 + (ps.dot ? 26 : 12), y: top + 41, class: 'mute', 'font-size': 12 }, g);
        const cs = conceptsOf(id);
        txt('개념 ' + cs.filter((c) => c.built).length + ' / ' + cs.length + ' 섰다 · 단계 ' + (s ? s.n : 0), { x: P.x - P.w / 2 + 12, y: top + 60, class: 'mute', 'font-size': 12 }, g);
        if (s && s.last) txt('최근 ' + s.last.flow + '·' + s.last.step + ' ' + whoOf(s.last), { x: P.x - P.w / 2 + 12, y: top + 79, class: 'mono', 'font-size': 11 }, g);
      }
      if (id === 'client') {
        const people = allUnits().reduce((a, u) => a + ((u.counts && u.counts.players) || 0), 0);
        txt('붙은 사람 ' + people, { x: P.x - P.w / 2 + 12, y: top + 44, 'font-size': 12 }, g);
        txt('요청 · 글 ' + (s ? s.n : 0), { x: P.x - P.w / 2 + 12, y: top + 63, class: 'mute', 'font-size': 12 }, g);
      }
      if (id === 'storage' || id === 'operator') txt('닿은 단계 ' + (s ? s.n : 0), { x: P.x + P.w / 2 - 12, y: top + 20, class: 'mute', 'font-size': 12, 'text-anchor': 'end' }, g);
      if (id === 'engine') drawUnits(P, g);
      const chips = chipsAt.get(id);
      if (chips) {
        let cx = P.x - P.w / 2, cy = P.y + P.h / 2 + 6;
        for (const c of chips) {
          const w = 10 + 6.5 * c.label.length;
          if (cx + w > P.x + P.w / 2 + 40) { cx = P.x - P.w / 2; cy += 21; }
          el('rect', { x: cx, y: cy, width: w, height: 17, rx: 8.5, class: 'chip' + (c.dim ? ' dim' : '') }, layers.over);
          txt(c.label, { x: cx + w / 2, y: cy + 12.5, class: 'chiptext', 'text-anchor': 'middle' }, layers.over);
          if (overlay && overlay.cur === c.label) el('rect', { x: cx - 3, y: cy - 3, width: w + 6, height: 23, rx: 11, fill: 'none', stroke: 'var(--hl)', 'stroke-width': 2 }, layers.over);
          cx += w + 4;
        }
      }
    }
  }
  function drawUnits(P, g) {
    const us = allUnits(); const x0 = P.x - P.w / 2 + 12; let y = P.y - P.h / 2 + 38;
    if (!us.length) { txt('인스턴스 없음 — 입장이 띄운다', { x: x0, y: y + 6, class: 'mute', 'font-size': 12 }, g); return; }
    for (const u of us.slice(0, 4)) {
      const row = el('rect', { x: x0, y: y - 12, width: P.w - 24, height: 26, rx: 6, fill: 'var(--panel)', stroke: only === u.unit ? 'var(--hl)' : 'var(--line)', style: 'cursor:pointer' }, g);
      const unit = u.unit; row.addEventListener('click', (e) => { e.stopPropagation(); only = only === unit ? null : unit; schedule(); });
      el('circle', { cx: x0 + 12, cy: y + 1, r: 5, class: 'st-' + (u.state || 'stopped') }, g);
      txt(u.unit + '  ' + (u.state || '-'), { x: x0 + 24, y: y + 5, 'font-size': 12, 'font-weight': 600 }, g);
      const c = u.counts || {};
      txt(['사람 ' + (c.players ?? 0), c.port !== undefined ? ':' + c.port : ''].filter(Boolean).join(' · '), { x: x0 + P.w - 36, y: y + 5, class: 'mute mono', 'font-size': 11, 'text-anchor': 'end' }, g);
      y += 31;
    }
    if (us.length > 4) txt('+' + (us.length - 4) + ' 더', { x: x0, y: y + 4, class: 'mute', 'font-size': 11 }, g);
    txt('호스트 + NPC 에이전트 · 인스턴스마다', { x: x0, y: P.y + P.h / 2 - 10, class: 'mute', 'font-size': 11 }, g);
  }
  function whoOf(t) { const st = STEP.get(t.flow + '.' + t.step); return st ? st.who.replace(/\\x60/g, '') : '?'; }

  // 흐름 · run 의 길 — 마디마다의 # 과 연결마다의 #
  function overlayEdges() {
    const edges = new Map(); const chips = new Map();
    for (const x of overlay.layout) {
      const dim = overlay.kind === 'flow' && !x.st.traced;
      if (!chips.has(x.proc)) chips.set(x.proc, []);
      chips.get(x.proc).push({ label: x.label, dim });
      const add = (a, b) => { const e = edgeOf(a, b); if (!e) return; if (!edges.has(e.key)) edges.set(e.key, []); const l = edges.get(e.key); if (!l.includes(x.label)) l.push(x.label); };
      for (const [a, b] of x.hops) add(a, b);
      for (const o of x.ext) add(x.proc, o);
    }
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
      const f = flying[i]; const k = (now - f.t0) / f.dur;
      if (k >= 1) { flying.splice(i, 1); continue; }
      const segs = f.pts.length / 2; const at = Math.min(segs - 1e-6, k * segs); const si = Math.floor(at); const u = at - si;
      const p = f.pts[si * 2], q = f.pts[si * 2 + 1];
      el('circle', { cx: p.x + (q.x - p.x) * u, cy: p.y + (q.y - p.y) * u, r: 6, class: 'st-' + (f.end === 'ok' ? 'ready' : f.end === 'wait' ? 'starting' : f.end === 'refused' ? 'stopping' : 'failed'), opacity: 0.9 }, layers.flyer);
    }
    requestAnimationFrame(frame);
  }

  // ── 옆 판
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const md = (s) => esc(s).replace(/\\x60([^\\x60]+)\\x60/g, '<code>$1</code>');
  const time = (at) => new Date(at).toLocaleTimeString('ko-KR', { hour12: false }) + '.' + String(at % 1000).padStart(3, '0');
  const kv = (o) => Object.entries(o || {}).map(([k, v]) => k + ' ' + v).join(' · ');

  function seqHtml(layout, kind) {
    return '<div class="seq">' + layout.map((x) => {
      const dim = kind === 'flow' && !x.st.traced;
      const where = LABEL[x.proc] + (x.hops.length ? ' ←' + LABEL[x.hops[0][0]].split(' ')[0] : '') + (x.ext.length ? ' ⇄ ' + x.ext.map((e) => LABEL[e]).join('·') : '');
      return '<div class="srow' + (dim ? ' dim' : '') + (overlay && overlay.cur === x.label ? ' cur' : '') + '"><span class="no">' + x.label + '</span><span class="where" title="' + esc(where) + '">' + esc(where) + '</span><span><b>' + md(x.st.who || '') + '</b> <span class="what">' + md(x.st.what || '') + '</span>' + (x.s.end ? ' <span class="dot ' + x.s.end + '"></span>' : '') + '</span></div>';
    }).join('') + '</div>';
  }

  function renderDetail() {
    const d = document.getElementById('detail'); let h = '';
    if (overlay) {
      const f = FLOW.get(overlay.flow);
      const traced = f.steps.filter((s) => s.traced).length;
      h += '<h2>' + (overlay.kind === 'flow' ? '흐름의 길 — 설계' : '실행의 길 — 실제로 지나간 것') + '</h2>';
      h += '<p><b>흐름 ' + f.flow + '. ' + esc(f.name) + '</b> <span class="sub">' + md(f.title) + '</span></p>';
      h += '<p class="sub">트리거: ' + md(f.trigger) + '</p>';
      if (overlay.kind === 'flow') h += '<p class="sub">지금 코드가 도는 단계 ' + traced + ' / ' + f.steps.length + ' — 흐린 줄은 아직 없다</p>';
      else { const r = runs.get(overlay.id); h += '<p class="sub">' + (r && (r.name || r.who) ? '누구: <b>' + esc(r.name || '가명 ' + r.who) + '</b>' + (r.name && r.who ? ' <span class="al">' + esc(r.who) + '</span>' : '') + ' · ' : '') + (r && r.session ? '세션 ' + esc(r.session) + ' · ' : '') + (r && r.unit ? '인스턴스 ' + esc(r.unit) + ' · ' : '') + 'run ' + esc(overlay.label) + ' · 단계 ' + overlay.layout.length + '</p>'; }
      h += '<div class="btns"><button id="play">재생</button><button id="clear">실시간으로</button></div>';
      h += seqHtml(overlay.layout, overlay.kind);
    } else if (sel.kind === 'node') {
      const n = NODE.get(sel.id); const ps = procState(sel.id); const s = stat.get(sel.id);
      h += '<h2>마디</h2><p><b>' + esc(LABEL[sel.id] || n.name) + '</b> <code>' + esc(n.id) + '</code> <span class="sub">' + esc(ps.text) + '</span></p>';
      if (!n.external) h += '<p class="sub">듣는 것: ' + md(n.listens) + '</p><p class="sub">상태: ' + md(n.holds) + '</p><p class="sub">늘리는 법: ' + md(n.scale) + '</p>';
      const cs = conceptsOf(sel.id);
      if (cs.length) h += '<p class="sub">사는 개념 — 테가 초록이면 src 에 섰다</p><div class="chips">' + cs.map((c) => '<span class="cchip' + (c.built ? ' built' : '') + '" title="' + esc(c.duty) + '">' + esc(c.name) + '</span>').join('') + '</div>';
      const here = []; for (const [fl, l] of FLOWLAY) for (const x of l) if (x.proc === sel.id || x.ext.includes(sel.id)) here.push(fl + '·' + x.step);
      h += '<p class="sub">여기서 일어나는 단계 ' + here.length + ' — ' + esc(here.slice(0, 40).join(' ')) + (here.length > 40 ? ' …' : '') + '</p>';
      h += '<p class="sub">지금까지 지난 단계 ' + (s ? s.n : 0) + (s && s.bad ? ' · 거절 · 실패 ' + s.bad : '') + '</p>';
      if (sel.id === 'engine') h += allUnits().map((u) => '<p class="sub"><b>' + esc(u.unit) + '</b> ' + esc(u.state || '-') + ' · ' + esc(kv(u.counts)) + '</p>').join('');
    } else if (sel.kind === 'edge') {
      const e = EDGES.find((x) => x.key === sel.id);
      h += '<h2>연결</h2><p><b>' + esc(e.link.name) + '</b> <span class="sub">' + esc(LABEL[e.a]) + ' — ' + esc(LABEL[e.b]) + '</span></p>';
      h += '<p class="sub">방향: ' + md(e.link.direction) + '</p><p class="sub">싣는 것: ' + md(e.link.carries) + '</p>';
      if (e.link.touches.length) h += '<p class="sub">닿는 개념: ' + esc(e.link.touches.join(' · ')) + '</p>';
      h += '<p class="sub">넘은 흔적 ' + e.n + '</p>';
      h += e.msgs.map((m) => '<p class="sub"><span class="dot ' + m.t.end + '"></span> ' + time(m.t.at) + ' 흐름 ' + m.t.flow + '·' + m.t.step + ' ' + md(whoOf(m.t)) + '</p>').join('');
    } else {
      h += '<h2>읽는 법</h2><p class="sub">상자는 프로세스(api · gateway · control · node)와 밖(클라이언트 · 엔진 · 스토리지 · 운영자)이다. 흐름의 단계는 그 개념이 사는 상자에서 일어나고, 앞 단계와 상자가 바뀌면 그 사이의 연결을 넘는다. 흔적이 날 때마다 점 하나가 그 연결을 따라 움직인다.</p>';
      h += '<p class="sub">상자를 누르면 그 프로세스의 개념 · 단계, 선을 누르면 그 연결로 넘은 글. 아래에서 흐름을 고르면 그 길이 그림 위에 번호로 놓인다.</p>';
    }
    d.innerHTML = h;
    const play = document.getElementById('play'); if (play) play.onclick = startReplay;
    const clear = document.getElementById('clear'); if (clear) clear.onclick = () => { overlay = null; stopReplay(); schedule(); };
  }

  function renderFlows() {
    document.getElementById('flows').innerHTML = MAP.flows.map((f) => {
      const t = f.steps.filter((s) => s.traced).length;
      return '<div class="frow' + (overlay && overlay.kind === 'flow' && overlay.flow === f.flow ? ' sel' : '') + '" data-flow="' + f.flow + '"><span class="n">' + f.flow + '</span><span>' + esc(f.name) + '</span><span class="c">' + t + ' / ' + f.steps.length + '</span><span class="bar"><i style="width:' + Math.round((100 * t) / Math.max(1, f.steps.length)) + '%"></i></span></div>';
    }).join('');
  }
  const ago = (at) => { const d = Math.max(0, Math.round((Date.now() - at) / 1000)); return d < 60 ? d + '초 전' : d < 3600 ? Math.round(d / 60) + '분 전' : Math.round(d / 3600) + '시간 전'; };
  const personOf = (r) => r.name || (r.who ? '가명 ' + r.who : null);
  function matches(r) {
    if (only && r.unit !== only) return false;
    if (!query) return true;
    return [r.name, r.who, r.session, r.unit, r.run].some((x) => x && String(x).toLowerCase().includes(query));
  }
  function actHtml(r) {
    const f = FLOW.get(r.flow);
    return '<span class="act' + (overlay && overlay.kind === 'run' && overlay.id === r.id ? ' sel' : '') + '" data-run="' + esc(r.id) + '" title="run ' + esc(r.run) + (r.session ? ' · 세션 ' + esc(r.session) : '') + '"><span class="dot ' + r.end + '"></span>' + esc(f ? f.name : '흐름 ' + r.flow) + (r.unit ? ' · ' + esc(r.unit) : '') + '</span>';
  }
  function renderRuns() {
    const list = [...runs.values()].filter(matches).sort((a, b) => b.at - a.at);
    // 사람 — 가명마다 한 줄. 가명이 없는 사람의 실행(틀린 토큰 · 주체)은 「누군지 모름」 한 줄로
    const people = new Map();
    for (const r of list.filter((r) => r.owner === 'person')) {
      const key = r.who || '?';
      let p = people.get(key); if (!p) { p = { key, who: r.who, name: null, units: new Set(), sessions: new Set(), runs: [], at: 0, end: r.end }; people.set(key, p); }
      if (!p.name && r.name) p.name = r.name; if (r.unit) p.units.add(r.unit); if (r.session) p.sessions.add(r.session);
      p.runs.push(r); if (r.at > p.at) { p.at = r.at; p.end = r.end; }
    }
    let h = '<div class="sec2">사람 ' + [...people.values()].filter((p) => p.who).length + '</div>';
    if (people.size === 0) h += '<p class="empty">아직 사람이 없다 — 로그인 · 입장이 오면 선다</p>';
    for (const p of [...people.values()].sort((a, b) => (a.who ? 0 : 1) - (b.who ? 0 : 1) || b.at - a.at).slice(0, 60)) {
      const title = p.who ? (p.name ? '<span class="nm">' + esc(p.name) + '</span> <span class="al">' + esc(p.who) + '</span>' : '<span class="nm">가명 ' + esc(p.who) + '</span>') : '<span class="nm">누군지 모름</span> <span class="al">토큰 · 주체가 틀린 요청</span>';
      const sess = [...p.sessions].slice(-2).map((x) => '<span class="tag" title="세션">세션 ' + esc(x) + '</span>').join(' ');
      const inst = [...p.units].map((u) => '<span class="tag inst" data-unit="' + esc(u) + '" title="이 인스턴스만 보기">' + esc(u) + '</span>').join(' ');
      h += '<div class="person"><div class="top"><span class="dot ' + p.end + '"></span>' + title + ' ' + inst + '<span class="ago">' + ago(p.at) + '</span></div>' + (sess ? '<div class="acts">' + sess + '</div>' : '') + '<div class="acts">' + p.runs.slice(0, 8).map(actHtml).join('') + (p.runs.length > 8 ? '<span class="al">+' + (p.runs.length - 8) + '</span>' : '') + '</div></div>';
    }
    const ops = list.filter((r) => r.owner === 'operator');
    h += '<div class="sec2">운영자 ' + ops.length + '</div>';
    h += ops.length === 0 ? '<p class="empty">명령이 없었다</p>' : '<div class="acts">' + ops.slice(0, 20).map(actHtml).join('') + '</div>';
    h += '<div class="sec2">기계 — 흐름마다의 셈</div>';
    const ms = [...machine.entries()].sort((a, b) => a[0] - b[0]);
    h += ms.length === 0 ? '<p class="empty">아직 없다</p>' : ms.map(([fl, m]) => '<div class="machine" data-run="' + esc(m.last) + '"><span class="n mono">' + fl + '</span><span>' + esc(FLOW.get(fl) ? FLOW.get(fl).name : '') + ' · ' + m.n + '번' + (m.bad ? ' · <span style="color:var(--failed)">거절 · 실패 ' + m.bad + '</span>' : '') + '</span><span class="al">' + ago(m.at) + '</span></div>').join('');
    const bad = list.filter((r) => r.owner === 'machine' && r.bad).slice(0, 10);
    if (bad.length) h += '<div class="acts">' + bad.map(actHtml).join('') + '</div>';
    document.getElementById('runs').innerHTML = h;
    document.getElementById('only').innerHTML = only ? '<span class="tag inst" data-clear="1">인스턴스 ' + esc(only) + ' 만 · 지우기</span>' : '';
  }
  function renderLog() {
    document.getElementById('log').innerHTML = log.slice(0, 150).map((x) => { const t = x.t;
      return '<tr><td class="mono">' + time(t.at) + '</td><td class="mono">' + t.flow + ' · ' + t.step + '</td><td>' + md(whoOf(t)) + '</td><td>' + esc(t.name || (t.who ? '가명 ' + t.who : '-')) + (t.session ? ' <span class="al">· ' + esc(t.session) + '</span>' : '') + '</td><td>' + esc(x.where) + '</td><td>' + esc(t.unit) + '</td><td><span class="dot ' + t.end + '"></span> ' + t.end + '</td><td class="mono">' + esc([t.state, kv(t.counts)].filter(Boolean).join(' · ')) + '</td></tr>'; }).join('');
  }
  function renderHead() {
    const m = sources.map((s) => s.metrics).filter(Boolean);
    document.getElementById('who').textContent = m.length === 0 ? '—' : m.map((x) => 'Monitor ' + x.role + ' · build ' + x.build).join(' / ');
    const open = sources.filter((s) => s.open).length, closing = m.some((x) => x.closing);
    const dot = open === sources.length ? (closing ? 'refused' : 'ok') : 'failed';
    document.getElementById('conn').innerHTML = '<span class="dot ' + dot + '"></span>' + (open === sources.length ? (closing ? '내려가는 중' : '듣는 중') : '끊김 — 다시 붙는다');
    document.getElementById('total').textContent = '흔적 ' + total;
    document.getElementById('mode').textContent = overlay ? (overlay.kind === 'flow' ? '흐름 ' + overlay.flow + ' 의 길' : 'run 의 길') : '실시간';
  }

  function pick(kind, id) { overlay = null; stopReplay(); sel = sel.kind === kind && sel.id === id ? { kind: null, id: null } : { kind, id }; schedule(); }
  function showFlow(n) { const f = FLOW.get(n); overlay = { kind: 'flow', flow: n, layout: FLOWLAY.get(n), cur: null }; sel = { kind: null, id: null }; stopReplay(); schedule(); }
  function showRun(id) { const r = runs.get(id); if (!r) return; overlay = { kind: 'run', id, flow: r.flow, label: r.run, layout: lay(r.flow, r.traces), cur: null }; stopReplay(); schedule(); }
  function startReplay() {
    stopReplay(); if (!overlay) return; let i = 0; const L = overlay.layout;
    replay = setInterval(() => {
      if (!overlay || i >= L.length) { stopReplay(); return; }
      const x = L[i++]; overlay.cur = x.label;
      const end = x.s.end || (x.st.traced ? 'ok' : 'wait');
      if (x.hops.length) fly([x.hops[0][0], ...x.hops.map((h) => h[1])], end);
      for (const o of x.ext) { if (x.dir === 'in') fly([o, x.proc], end); else if (x.dir === 'out') fly([x.proc, o], end); else { fly([x.proc, o], end); setTimeout(() => fly([o, x.proc], end), 380); } }
      pulse(x.proc); schedule();
    }, 700);
  }
  function stopReplay() { if (replay) clearInterval(replay); replay = null; if (overlay) overlay.cur = null; }

  document.getElementById('flows').addEventListener('click', (e) => { const r = e.target.closest('[data-flow]'); if (r) { const n = Number(r.dataset.flow); if (overlay && overlay.kind === 'flow' && overlay.flow === n) { overlay = null; schedule(); } else showFlow(n); } });
  document.getElementById('runs').addEventListener('click', (e) => {
    const u = e.target.closest('[data-unit]'); if (u) { only = only === u.dataset.unit ? null : u.dataset.unit; schedule(); return; }
    const r = e.target.closest('[data-run]'); if (r) showRun(r.dataset.run);
  });
  document.getElementById('only').addEventListener('click', () => { only = null; schedule(); });
  document.getElementById('q').addEventListener('input', (e) => { query = e.target.value.trim().toLowerCase(); schedule(); });

  let queued = false;
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(render); } }
  function render() { queued = false; renderHead(); draw(); renderDetail(); renderFlows(); renderRuns(); renderLog(); }
  setInterval(schedule, 1000);
  const hash = Number(location.hash.slice(1)); if (hash && FLOW.has(hash)) showFlow(hash);
  sources.forEach(connect);
  render();
  requestAnimationFrame(frame);
})();
</script>
</body>
</html>
`;
}
