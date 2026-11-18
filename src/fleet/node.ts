// Node (값) — 인스턴스를 띄우는 서버 하나 (design/02-roles/fleet.md 의 Node). Nodes 가 든다.

import type { NodeReport } from '../protocol/node';

export interface Node {
  readonly name: string;
  /** NodeRpc 의 주소(내부망) */
  address: string;
  /** 내부망에서 이 노드의 호스트가 보이는 이름 */
  host: string;
  build: string;
  /** 띄울 수 있는 인스턴스의 수 */
  slots: number;
  /** 마지막 보고가 온 때(ms) */
  seen: number;
  /** 새로 띄우지 않는다 — 운영자의 cordon. 표 `nodes` 에 남는다 */
  cordoned: boolean;
  /** 내려가는 가운데 — 띄우지도 배정하지도 않는다(흐름 7 의 1) */
  closing: boolean;
  /** 마지막 보고 */
  report: NodeReport | null;
}
