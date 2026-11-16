// 게스트 페이지 — Api 의 `GET /` (design/README.md 의 Api). 브라우저(밖)가 login(흐름 2) → characters · create · choose · delete(흐름 8) → enter(흐름 3)를 부르고
// 받은 주소(뷰어 페이지)로 간다. 줄에 서면({wait}) 순번을 보이고 잠시 뒤 다시 묻는다(흐름 3 의 21).
// 게스트의 주체는 브라우저의 localStorage 가 든다 — 같은 브라우저로 다시 오면 같은 계정 · 같은 캐릭터들(흐름 2 규칙).

export const PAGE = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>hkt adventure online</title>
<style>
  :root { color-scheme: light dark; --bg: #f6f4ef; --fg: #1d1c1a; --muted: #6b6760; --accent: #2f6f4e; --line: #d9d5cc; }
  @media (prefers-color-scheme: dark) { :root { --bg: #161614; --fg: #ecebe6; --muted: #9a968e; --accent: #6cc196; --line: #34322e; } }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; }
  main { width: min(28rem, calc(100% - 32px)); }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  p { color: var(--muted); margin: 0 0 1.5rem; }
  button { font: inherit; padding: .6rem 1.1rem; border: 0; border-radius: .5rem; background: var(--accent); color: var(--bg); cursor: pointer; }
  button.quiet { background: transparent; color: var(--muted); border: 1px solid var(--line); padding: .5rem .8rem; }
  button:disabled { opacity: .6; cursor: wait; }
  input { font: inherit; padding: .55rem .7rem; border: 1px solid var(--line); border-radius: .5rem; background: transparent; color: inherit; min-width: 0; flex: 1; }
  #pick[hidden], #go[hidden] { display: none; }
  ul { list-style: none; padding: 0; margin: 0 0 1rem; }
  li { display: flex; gap: .5rem; align-items: center; padding: .5rem 0; border-bottom: 1px solid var(--line); }
  li .nm { flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
  .make { display: flex; gap: .5rem; }
  #say { margin-top: 1rem; min-height: 1.5em; color: var(--muted); }
</style>
</head>
<body>
<main>
  <h1>hkt adventure online</h1>
  <p>게스트로 들어가면 이 브라우저만의 계정이 열린다. 캐릭터를 만들어 고르면 세계로 간다. 다시 오면 이어진다.</p>
  <button id="go">들어가기</button>
  <section id="pick" hidden>
    <ul id="chars"></ul>
    <div class="make"><input id="name" maxlength="24" placeholder="새 캐릭터의 이름"><button id="make">만들기</button></div>
  </section>
  <div id="say"></div>
</main>
<script>
const $ = (id) => document.getElementById(id);
const say = (t) => ($('say').textContent = t);
const post = async (path, body) => {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { const e = new Error(j.why || r.statusText); e.busy = r.status === 503; throw e; }
  return j;
};
let subject = '';
try { subject = localStorage.getItem('hkt.guest') || ''; } catch {}
let account = '';
const busyAll = (on) => document.querySelectorAll('button').forEach((b) => (b.disabled = on));

function draw(list) {
  const ul = $('chars');
  ul.innerHTML = '';
  for (const c of list) {
    const li = document.createElement('li');
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = c.name;
    const go = document.createElement('button'); go.className = 'enter'; go.textContent = '들어가기'; go.onclick = () => play(c);
    const del = document.createElement('button'); del.className = 'quiet del'; del.textContent = '지우기'; del.onclick = () => drop(c);
    li.append(nm, go, del);
    ul.append(li);
  }
  if (list.length === 0) say('캐릭터가 없다 — 이름을 지어 만든다');
}

async function refresh() {
  const { characters } = await post('/characters', { token: account });
  draw(characters);
}

async function play(c) {
  busyAll(true);
  try {
    const { token } = await post('/choose', { token: account, character: c.id });
    say(c.name + ' — 세계를 띄우는 중 … (처음은 몇 초 걸린다)');
    for (;;) {
      let at;
      try { at = await post('/enter', { token }); }
      catch (err) { if (!err.busy) throw err; say('잠시 뒤 다시 — ' + err.message); await new Promise((r) => setTimeout(r, 3000)); continue; }
      if (at.page) { location.href = at.page; return; }
      say(c.name + ' — 자리를 기다린다 · 대기 ' + at.wait + ' 번째');
      await new Promise((r) => setTimeout(r, 2000));
    }
  } catch (err) {
    say('실패 — ' + err.message);
    busyAll(false);
  }
}

async function drop(c) {
  if (!confirm(c.name + ' 를 지운다 — 되돌릴 수 없다')) return;
  busyAll(true);
  try { await post('/delete', { token: account, character: c.id }); say(c.name + ' 를 지웠다'); await refresh(); }
  catch (err) { say('실패 — ' + err.message); }
  busyAll(false);
}

$('make').onclick = async () => {
  busyAll(true);
  try { const { character } = await post('/create', { token: account, name: $('name').value }); $('name').value = ''; say(character.name + ' 를 만들었다'); await refresh(); }
  catch (err) { say('실패 — ' + err.message); }
  busyAll(false);
};

$('go').onclick = async (e) => {
  e.target.disabled = true;
  try {
    say('로그인 …');
    const login = await post('/login', { provider: 'guest', subject });
    try { localStorage.setItem('hkt.guest', login.subject); } catch {}
    account = login.token;
    $('go').hidden = true;
    $('pick').hidden = false;
    say('');
    await refresh();
  } catch (err) {
    say('실패 — ' + err.message);
    e.target.disabled = false;
  }
};
</script>
</body>
</html>
`;
