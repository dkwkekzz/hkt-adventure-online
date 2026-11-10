#!/usr/bin/env bash
# engine — engine.lock 이 핀한 엔진의 커밋을 engine/ 에 세운다(체크아웃 + npm ci). 이미 그 커밋이면 의존만 확인한다.
#   npm run engine
#   ENGINE_REPO=/path/to/local/clone npm run engine     로컬 클론에서 가져온다(네트워크 없이)
# 엔진을 올리려면 engine.lock 의 둘째 줄(커밋)을 바꾸고, 엔진 web/ONLINE.md §1 을 다시 읽어 src/protocol/engine.ts 를 같은 커밋에서 고친다.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="${ENGINE_REPO:-$(sed -n 1p engine.lock)}"
COMMIT="$(sed -n 2p engine.lock)"
if [ ! -d engine/.git ]; then
  git init -q engine
  git -C engine remote add origin "$REPO"
fi
git -C engine remote set-url origin "$REPO"
if [ "$(git -C engine rev-parse -q --verify HEAD 2>/dev/null || true)" != "$COMMIT" ]; then
  git -C engine fetch -q --depth 1 origin "$COMMIT"
  git -C engine checkout -q --detach "$COMMIT"
fi
echo "engine $(git -C engine rev-parse --short HEAD) — $REPO"
cd engine/web
if [ ! -x node_modules/.bin/tsx ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci --include=dev --no-audit --no-fund
fi
echo "engine 준비 — engine/web/node_modules/.bin/tsx"
