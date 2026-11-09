// 게스트 페이지 — Api 의 `GET /` (design/README.md 의 Api). 브라우저(밖)가 login · enter 를 부르고 받은 주소(샤드의 뷰어 페이지)로 간다.
// 게스트의 주체는 브라우저의 localStorage 가 든다 — 같은 브라우저로 다시 오면 같은 계정 · 같은 세계(흐름 2 규칙).

export const PAGE = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>hkt adventure online</title>
<style>
  :root { color-scheme: light dark; --bg: #f6f4ef; --fg: #1d1c1a; --muted: #6b6760; --accent: #2f6f4e; }
  @media (prefers-color-scheme: dark) { :root { --bg: #161614; --fg: #ecebe6; --muted: #9a968e; --accent: #6cc196; } }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; }
  main { width: min(28rem, calc(100% - 32px)); }
  h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
  p { color: var(--muted); margin: 0 0 1.5rem; }
  button { font: inherit; padding: .7rem 1.2rem; border: 0; border-radius: .5rem; background: var(--accent); color: var(--bg); cursor: pointer; }
  button:disabled { opacity: .6; cursor: wait; }
  #say { margin-top: 1rem; min-height: 1.5em; color: var(--muted); }
</style>
</head>
<body>
<main>
  <h1>hkt adventure online</h1>
  <p>게스트로 들어가면 이 브라우저만의 세계가 열린다. 다시 오면 이어진다.</p>
  <button id="go">들어가기</button>
  <div id="say"></div>
</main>
<script>
const say = (t) => (document.getElementById('say').textContent = t);
const post = async (path, body) => {
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.why || r.statusText);
  return j;
};
let subject = '';
try { subject = localStorage.getItem('hkt.guest') || ''; } catch {}
document.getElementById('go').onclick = async (e) => {
  e.target.disabled = true;
  try {
    say('로그인 …');
    const login = await post('/login', { provider: 'guest', subject });
    try { localStorage.setItem('hkt.guest', login.subject); } catch {}
    say('세계를 띄우는 중 … (처음은 몇 초 걸린다)');
    const at = await post('/enter', { token: login.token });
    location.href = at.page;
  } catch (err) {
    say('실패 — ' + err.message);
    e.target.disabled = false;
  }
};
</script>
</body>
</html>
`;
