// 플릿 fleet (design/02-roles/fleet.md) — 컨트롤 플레인에서 인스턴스를 어느 노드에 띄우고 지키고 내릴지 정한다. 밖에 내보내는 것은 조립 하나다.
//   Fleet  Registry · Nodes · Scheduler · Scaler · Recoverer · Operator. 노드가 알리는 것(ControlSocket)을 받고, 노드에는 NodeSocket(앱이 준 nodeOf)으로 닿는다
// 앱이 닿는 것은 흐름의 (밖) 단계와 프로세스 사이의 소켓을 잇는 자리뿐이다(경계 규칙 P).

export { Fleet } from './fleet';
export type { FleetConfig, FleetHooks, FleetStorage, FleetZone } from './fleet';
export type { OperatorHooks } from './operator';
