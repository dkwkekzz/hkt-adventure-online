// 함대 fleet (design/02-roles/fleet.md). 앱이 닿는 것은 Fleet(생성 · start · stopAll · clock)과 Operator.command, 그리고 세션 모듈에 함수로 넘기는 ready · launch · address · load · unload 뿐이다(경계 규칙 P).

export { Fleet } from './fleet';
export type { FleetConfig, FleetHooks, FleetZone } from './fleet';
