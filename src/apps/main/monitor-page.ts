// 관측 페이지 한 장 — Monitor.page 가 준다(흐름 14 의 3). 흐름의 지도(FlowMap)를 품고, /observe 의 stream 으로 흔적과 수치를 받아 칠한다.
// ?from=<주소>,<주소> 면 여러 Monitor 의 stream 을 함께 읽는다(비면 이 페이지의 자리). #<흐름 번호> 가 고른 흐름.
// 의존 없음 — 글과 CSS 와 스크립트가 이 한 장에 든다.

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
  --bg: #f6f7f9; --panel: #ffffff; --line: #dfe3e8; --ink: #1d2329; --mute: #6b7580; --soft: #eef1f4;
  --ok: #1f9d55; --wait: #2f6fdb; --refused: #c27c0e; --failed: #d64545; --glow: #2f6fdb33;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #111418; --panel: #181c21; --line: #2a3038; --ink: #e4e8ec; --mute: #8b95a1; --soft: #20252c;
    --ok: #3ccf7c; --wait: #5b93f5; --refused: #e2a23b; --failed: #f06a6a; --glow: #5b93f540; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
header { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--line); background: var(--panel); position: sticky; top: 0; z-index: 2; }
header h1 { font-size: 15px; margin: 0; font-weight: 650; }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px; border: 1px solid var(--line); border-radius: 999px; font-size: 12px; color: var(--mute); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--mute); display: inline-block; }
.dot.ok { background: var(--ok); } .dot.wait { background: var(--wait); } .dot.refused { background: var(--refused); } .dot.failed { background: var(--failed); }
main { display: grid; grid-template-columns: minmax(230px, 280px) minmax(0, 1fr) minmax(240px, 300px); gap: 12px; padding: 12px 16px; }
@media (max-width: 1100px) { main { grid-template-columns: minmax(0, 1fr); } }
section.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px; min-width: 0; }
h2 { font-size: 12px; text-transform: none; letter-spacing: .02em; color: var(--mute); margin: 0 0 8px; font-weight: 600; }
code { font-family: var(--mono); font-size: 12px; background: var(--soft); padding: 0 4px; border-radius: 4px; }
.flows { display: flex; flex-direction: column; gap: 2px; }
.flow { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 6px; align-items: center; padding: 6px 8px; border-radius: 7px; cursor: pointer; border: 1px solid transparent; }
.flow:hover { background: var(--soft); }
.flow.sel { border-color: var(--wait); background: var(--glow); }
.flow .n { font-family: var(--mono); color: var(--mute); font-size: 12px; text-align: right; }
.flow .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.flow .cnt { font-family: var(--mono); font-size: 11px; color: var(--mute); }
.beads { grid-column: 2 / 4; display: flex; flex-wrap: wrap; gap: 3px; }
.bead { width: 9px; height: 9px; border-radius: 2px; background: var(--soft); border: 1px solid var(--line); }
.bead.built { background: var(--line); }
.bead.hot { box-shadow: 0 0 0 2px var(--glow); }
.bead.ok { background: var(--ok); border-color: var(--ok); } .bead.wait { background: var(--wait); border-color: var(--wait); }
.bead.refused { background: var(--refused); border-color: var(--refused); } .bead.failed { background: var(--failed); border-color: var(--failed); }
.bead.cold { opacity: .45; }
.title { font-size: 18px; font-weight: 650; margin: 0 0 2px; }
.sub { color: var(--mute); margin: 2px 0; }
pre.order { font-family: var(--mono); font-size: 12px; background: var(--soft); border-radius: 8px; padding: 10px; overflow-x: auto; margin: 10px 0; }
.sec { margin: 14px 0 6px; font-weight: 600; font-size: 13px; }
.steps { display: grid; gap: 6px; }
.step { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; transition: box-shadow .4s, border-color .4s; }
.step.unbuilt { border-style: dashed; opacity: .55; }
.step.unbuilt.seen { opacity: .9; }
.step.hot { border-color: var(--wait); box-shadow: 0 0 0 3px var(--glow); opacity: 1; }
.step.inrun { border-color: var(--ink); }
.step .no { font-family: var(--mono); font-size: 13px; color: var(--mute); padding-top: 1px; }
.step .who { font-weight: 600; } .step .role { font-size: 11px; color: var(--mute); margin-left: 6px; font-weight: 400; }
.step .what { color: var(--mute); font-size: 13px; }
.step .res { font-size: 12px; color: var(--mute); }
.tally { display: flex; gap: 6px; font-family: var(--mono); font-size: 11px; white-space: nowrap; }
.tally span { display: inline-flex; align-items: center; gap: 3px; }
.units { display: grid; gap: 6px; }
.unit { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
.unit .top { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.state { font-family: var(--mono); font-size: 11px; padding: 1px 7px; border-radius: 999px; border: 1px solid currentColor; }
.state.ready { color: var(--ok); } .state.starting, .state.stopping { color: var(--wait); } .state.failed { color: var(--failed); } .state.stopped { color: var(--mute); }
.kv { display: flex; flex-wrap: wrap; gap: 4px 10px; font-family: var(--mono); font-size: 11px; color: var(--mute); margin-top: 4px; }
.runs { display: grid; gap: 4px; margin-top: 4px; }
.run { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px; align-items: center; padding: 4px 6px; border-radius: 6px; cursor: pointer; font-size: 12px; }
.run:hover { background: var(--soft); } .run.sel { background: var(--glow); }
.run .path { font-family: var(--mono); font-size: 11px; color: var(--mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.empty { color: var(--mute); font-size: 12px; }
.log { grid-column: 1 / -1; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
td, th { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--line); white-space: nowrap; }
th { color: var(--mute); font-weight: 500; }
td.mono { font-family: var(--mono); }
.logwrap { max-height: 280px; overflow: auto; }
.legend { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; color: var(--mute); margin-top: 8px; }
</style>
</head>
<body>
<header>
  <h1>서비스 관측</h1>
  <span class="pill" id="who">—</span>
  <span class="pill" id="conn"><span class="dot"></span>붙는 중</span>
  <span class="pill" id="total">흔적 0</span>
</header>
<main>
  <section class="panel">
    <h2>흐름 — 칸 하나가 단계 하나</h2>
    <div class="flows" id="flows"></div>
    <div class="legend">
      <span><span class="dot ok"></span> ok</span><span><span class="dot wait"></span> wait ◇</span>
      <span><span class="dot refused"></span> refused ✕</span><span><span class="dot failed"></span> failed</span>
    </div>
  </section>
  <section class="panel" id="detail"></section>
  <section class="panel">
    <h2>단위 — 지금의 state</h2>
    <div class="units" id="units"></div>
    <h2 style="margin-top:16px">최근의 run</h2>
    <div class="runs" id="runs"></div>
  </section>
  <section class="panel log">
    <h2>흔적 — 최근 것이 위</h2>
    <div class="logwrap"><table><thead><tr><th>때</th><th>흐름 · #</th><th>단계</th><th>단위</th><th>끝</th><th>state · 수</th><th>run</th></tr></thead><tbody id="log"></tbody></table></div>
  </section>
</main>
<script type="application/json" id="map">${data}</script>
<script>
(() => {
  const MAP = JSON.parse(document.getElementById('map').textContent);
  const FLOW = new Map(MAP.flows.map((f) => [f.flow, f]));
  const STEP = new Map();
  for (const f of MAP.flows) for (const s of f.steps) STEP.set(f.flow + '.' + s.step, s);
  const ENDS = ['ok', 'wait', 'refused', 'failed'];
  const HOT = 4000, KEEP = 400, RUNS = 24;
  const params = new URLSearchParams(location.search);
  const froms = (params.get('from') || '').split(',').map((s) => s.trim().replace(/\\/$/, '')).filter(Boolean);
  const sources = (froms.length ? froms : ['']).map((base) => ({ base, open: false, metrics: null, tally: {}, units: new Map(), lastAt: 0 }));

  let selected = Number(location.hash.slice(1)) || 3;
  let pickedRun = null;
  const log = [];
  const runs = new Map();
  const last = new Map(); // 'flow.step' → { at, end }
  let total = 0;

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const md = (s) => esc(s).replace(/\`([^\`]+)\`/g, '<code>$1</code>');
  const time = (at) => new Date(at).toLocaleTimeString('ko-KR', { hour12: false }) + '.' + String(at % 1000).padStart(3, '0');
  const kv = (o) => Object.entries(o || {}).map(([k, v]) => k + ' ' + v).join(' · ');

  function ingest(src, t, live) {
    src.lastAt = Math.max(src.lastAt, t.at);
    total++;
    const key = t.flow + '.' + t.step;
    if (live) {
      const k = key + '.' + t.end;
      src.tally[k] = (src.tally[k] || 0) + 1;
    }
    last.set(key, { at: live ? Date.now() : t.at, end: t.end });
    if (t.unit !== '-' && (t.state !== undefined || t.counts !== undefined)) {
      const was = src.units.get(t.unit);
      src.units.set(t.unit, { unit: t.unit, state: t.state ?? (was ? was.state : null), counts: Object.assign({}, was && was.counts, t.counts), at: t.at });
    }
    const id = (src.base || '') + '|' + t.run;
    let r = runs.get(id);
    if (!r) { r = { id, run: t.run, flow: t.flow, traces: [] }; runs.set(id, r); }
    r.traces.push(t); r.at = t.at; r.end = t.end;
    if (runs.size > RUNS * 3) { const old = [...runs.values()].sort((a, b) => a.at - b.at).slice(0, runs.size - RUNS * 2); for (const o of old) runs.delete(o.id); }
    log.unshift(t); if (log.length > KEEP) log.length = KEEP;
    schedule();
  }

  function connect(src) {
    const es = new EventSource((src.base || '') + '/observe');
    es.addEventListener('open', () => { src.open = true; schedule(); });
    es.addEventListener('error', () => { src.open = false; schedule(); });
    es.addEventListener('metrics', (e) => {
      const v = JSON.parse(e.data);
      const m = v.metrics || v;
      src.metrics = m; src.tally = Object.assign({}, m.tally);
      src.units = new Map(m.units.map((u) => [u.unit, u]));
      const since = src.lastAt; // 다시 붙어 받은 recent 가운데 이미 본 것은 뺀다
      if (v.recent) for (const t of v.recent) if (t.at > since) ingest(src, t, false);
      schedule();
    });
    es.addEventListener('trace', (e) => ingest(src, JSON.parse(e.data), true));
  }

  const count = (key) => { const o = {}; for (const end of ENDS) { let n = 0; for (const s of sources) n += s.tally[key + '.' + end] || 0; if (n) o[end] = n; } return o; };
  const isHot = (key, now) => { const l = last.get(key); return l && now - l.at < HOT ? l : null; };

  function tallyHtml(c) { return '<div class="tally">' + ENDS.filter((e) => c[e]).map((e) => '<span><span class="dot ' + e + '"></span>' + c[e] + '</span>').join('') + '</div>'; }

  function renderFlows(now) {
    document.getElementById('flows').innerHTML = MAP.flows.map((f) => {
      let n = 0;
      const beads = f.steps.map((s) => {
        const key = f.flow + '.' + s.step, c = count(key), hot = isHot(key, now), l = last.get(key);
        for (const e in c) n += c[e];
        const cls = ['bead', s.built ? 'built' : ''];
        if (l) cls.push(l.end, hot ? 'hot' : 'cold');
        return '<span class="' + cls.join(' ') + '" title="' + esc(s.step + ' ' + s.who) + '"></span>';
      }).join('');
      return '<div class="flow' + (f.flow === selected ? ' sel' : '') + '" data-flow="' + f.flow + '"><span class="n">' + f.flow + '</span><span class="nm">' + esc(f.name) + '</span><span class="cnt">' + (n || '') + '</span><div class="beads">' + beads + '</div></div>';
    }).join('');
  }

  function renderDetail(now) {
    const f = FLOW.get(selected);
    const el = document.getElementById('detail');
    if (!f) { el.innerHTML = '<p class="empty">흐름이 없다</p>'; return; }
    const run = pickedRun && runs.get(pickedRun);
    const inRun = new Set(run ? run.traces.map((t) => t.flow + '.' + t.step) : []);
    const built = f.steps.filter((s) => s.built).length;
    let html = '<h2>' + esc(f.file) + ' · src 에 선 단계 ' + built + ' / ' + f.steps.length + '</h2>';
    html += '<p class="title">흐름 ' + f.flow + '. ' + esc(f.name) + '</p><p class="sub">' + md(f.title) + '</p>';
    html += '<p class="sub">트리거: ' + md(f.trigger) + '</p><p class="sub">' + md(f.line) + '</p>';
    if (f.order) html += '<pre class="order">' + esc(f.order) + '</pre>';
    let sec = null;
    for (const s of f.steps) {
      if (s.section !== sec) { if (sec !== null) html += '</div>'; sec = s.section; html += (sec ? '<div class="sec">' + esc(sec) + '</div>' : '') + '<div class="steps">'; }
      const key = f.flow + '.' + s.step, cls = ['step'];
      const c = count(key);
      if (!s.built) cls.push('unbuilt');
      if (Object.keys(c).length > 0) cls.push('seen');
      if (isHot(key, now)) cls.push('hot');
      if (inRun.has(key)) cls.push('inrun');
      html += '<div class="' + cls.join(' ') + '"><span class="no">' + s.step + '</span><div><div class="who">' + md(s.who) + (s.role ? '<span class="role">' + esc(s.role) + '</span>' : '') + '</div><div class="what">' + md(s.what) + '</div>' + (s.result ? '<div class="res">→ ' + md(s.result) + '</div>' : '') + '</div>' + tallyHtml(c) + '</div>';
    }
    if (sec !== null) html += '</div>';
    html += '<div class="legend"><span>점선 = 설계의 개념이 src 에 아직 파일로 서지 않았다(수가 있으면 지금의 코드가 그 일을 한다)</span><span>빛남 = 방금 지났다</span>' + (run ? '<span>굵은 테 = 고른 run ' + esc(run.run) + '</span>' : '') + '</div>';
    el.innerHTML = html;
  }

  function renderSide() {
    const units = [];
    for (const s of sources) for (const u of s.units.values()) units.push(u);
    document.getElementById('units').innerHTML = units.length === 0 ? '<p class="empty">아직 단위가 없다 — 입장이 세계를 띄우면 선다</p>' :
      units.map((u) => '<div class="unit"><div class="top"><b>' + esc(u.unit) + '</b><span class="state ' + esc(u.state || '') + '">' + esc(u.state || '-') + '</span></div><div class="kv">' + esc(kv(u.counts)) + '</div></div>').join('');
    const list = [...runs.values()].sort((a, b) => b.at - a.at).slice(0, RUNS);
    document.getElementById('runs').innerHTML = list.length === 0 ? '<p class="empty">흔적을 기다린다</p>' : list.map((r) => {
      const f = FLOW.get(r.flow);
      const path = r.traces.map((t) => (t.flow !== r.flow ? t.flow + '·' : '') + t.step).join(' → ');
      return '<div class="run' + (r.id === pickedRun ? ' sel' : '') + '" data-run="' + esc(r.id) + '" data-flow="' + r.flow + '"><span><span class="dot ' + r.end + '"></span> ' + r.flow + ' ' + esc(f ? f.name : '') + '</span><span class="path">' + esc(path) + '</span></div>';
    }).join('');
  }

  function renderLog() {
    document.getElementById('log').innerHTML = log.slice(0, 150).map((t) => {
      const s = STEP.get(t.flow + '.' + t.step);
      return '<tr><td class="mono">' + time(t.at) + '</td><td class="mono">' + t.flow + ' · ' + t.step + '</td><td>' + md(s ? s.who : '(흐름에 없다)') + '</td><td>' + esc(t.unit) + '</td><td><span class="dot ' + t.end + '"></span> ' + t.end + '</td><td class="mono">' + esc([t.state, kv(t.counts)].filter(Boolean).join(' · ')) + '</td><td class="mono">' + esc(t.run) + '</td></tr>';
    }).join('');
  }

  function renderHead() {
    const m = sources.map((s) => s.metrics).filter(Boolean);
    document.getElementById('who').textContent = m.length === 0 ? '—' : m.map((x) => x.role + ' · build ' + x.build).join(' / ');
    const open = sources.filter((s) => s.open).length, closing = m.some((x) => x.closing);
    const dot = open === sources.length ? (closing ? 'refused' : 'ok') : open > 0 ? 'refused' : 'failed';
    const text = open === sources.length ? (closing ? '내려가는 중' : '듣는 중') : open > 0 ? '일부 끊김 ' + open + '/' + sources.length : '끊김 — 다시 붙는다';
    document.getElementById('conn').innerHTML = '<span class="dot ' + dot + '"></span>' + text + (sources.length > 1 ? ' · Monitor ' + sources.length : '');
    document.getElementById('total').textContent = '흔적 ' + total;
  }

  let queued = false;
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(render); } }
  function render() { queued = false; const now = Date.now(); renderHead(); renderFlows(now); renderDetail(now); renderSide(); renderLog(); }

  document.getElementById('flows').addEventListener('click', (e) => { const el = e.target.closest('[data-flow]'); if (el) { selected = Number(el.dataset.flow); pickedRun = null; location.hash = String(selected); schedule(); } });
  document.getElementById('runs').addEventListener('click', (e) => { const el = e.target.closest('[data-run]'); if (el) { pickedRun = pickedRun === el.dataset.run ? null : el.dataset.run; selected = Number(el.dataset.flow); location.hash = String(selected); schedule(); } });
  window.addEventListener('hashchange', () => { const n = Number(location.hash.slice(1)); if (n && n !== selected) { selected = n; schedule(); } });
  setInterval(schedule, 1000);
  sources.forEach(connect);
  render();
})();
</script>
</body>
</html>
`;
}
