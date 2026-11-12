# plan 06 — 엔진의 면

상태: ☐ · 어디: proto · design/README.md 의 「엔진의 면」

서비스가 캐릭터의 값을 옮기고 존을 옮기는 데 기대는 엔진의 면. 설계는 엔진 저장소에 섰다(dkwkekzz/hkt-adventure-proto#144). 들어간 커밋을 `engine.lock` 에 핀하고 `ONLINE.md` §1 을 다시 읽어 `src/protocol/engine.ts` 를 같은 커밋에서 고친다.

## 세울 것

| | 엔진 plan | 무엇 |
|---|---|---|
| ☐ | 267 | 통째 저장 · Console `backup <dir>` |
| ☐ | 268 | `--handoff <dir>` · `load` · `unload` · `keep` |
| ☐ | 269 | 떠남 줄 · status 의 ` · 지연 N` |
| ☐ | 270 | 뷰어의 다시 열림 · `?exit=` |

## 관측에 보일 것

- `protocol/engine.ts` 가 바뀌면 Probe.read 가 알아보는 줄(떠남 · backup 끝 · 지연)이 흐름 4 의 흔적으로 남는다 — 인스턴스의 counts 에 지연(lag)이 들어 서버 보기의 인스턴스 줄에 보인다.

## 직관 확인

엔진의 `npm run check` — 한 호스트에서 `unload` 한 묶음이 다른 호스트에 `load` 로 그대로 선다.
