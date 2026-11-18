// 노드 node (design/02-roles/node.md) — 서버 하나에서 인스턴스의 프로세스를 띄우고 내리고, 캐릭터의 값을 올리고 내린다. 밖에 내보내는 것은 조립 하나와 Spawner 다.
//   NodeAgent     Runner · Console · Ports · Loader · Backuper · NodeReporter · Clock. 컨트롤 플레인이 보내는 것(NodeSocket)을 받고, 알리는 것은 앱이 준 ControlSocket 으로
//   Spawner       엔진 프로세스를 띄운다 — API 서버의 시작이 뷰어를 묶는 데 쓴다(흐름 1 의 2 — Spawner.bundle)
// 앱이 닿는 것은 흐름의 (밖) 단계와 프로세스 사이의 소켓을 잇는 자리뿐이다(경계 규칙 P).

export { NodeAgent } from './node-agent';
export type { NodeConfig, NodeStorage } from './node-agent';
export { Spawner } from './spawner';
