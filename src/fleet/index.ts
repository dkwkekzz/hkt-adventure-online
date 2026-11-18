// 함대 fleet (design/02-roles/fleet.md). 밖에 내보내는 것은 조립 둘과 뷰어의 묶음 하나다.
//   Fleet      컨트롤 플레인의 반 — Registry · Nodes · Scheduler · Scaler · Recoverer · Operator. 노드가 알리는 것(ControlSocket)을 받는다
//   NodeAgent  노드의 반 — Runner · Console · Ports · Loader · Backuper · NodeReporter. 컨트롤 플레인이 보내는 것(NodeSocket)을 받는다
//   bundleViewer  API 서버의 시작(흐름 1 의 2 — Spawner.bundle)
// 앱이 닿는 것은 흐름의 (밖) 단계와 프로세스 사이의 소켓을 잇는 자리뿐이다(경계 규칙 P).

export { Fleet } from './fleet';
export type { FleetConfig, FleetHooks, FleetStorage, FleetZone } from './fleet';
export { NodeAgent } from './node-agent';
export type { NodeConfig, NodeStorage } from './node-agent';
export type { OperatorHooks } from './operator';
export { bundleViewer } from './bundle';
