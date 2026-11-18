// Instance (값) — 인스턴스 하나 = 호스트 하나 = Store 자리 하나 (design/02-roles/fleet.md 의 Instance). 표 `instances` 의 줄.
// name · zone 은 불변. 나머지는 Registry 가 고친다.
import { leaseHolder } from '../protocol/node';

export type InstanceState = 'starting' | 'ready' | 'stopping' | 'stopped' | 'failed';

export interface Instance {
  /** `<존>-<번호>` */
  readonly name: string;
  readonly zone: string;
  /** 띄운(띄울) 노드 — 지금은 이 서버의 노드 하나(plan 08 이 여럿으로) */
  node: string;
  /** 호스트가 듣는 포트(내부망). 내려가 있으면 null */
  port: number | null;
  /** 세대 — 띄울 때마다 하나 오른다(흐름 3 의 11). lease 의 holder · Store 의 올림이 이것으로 낡은 것을 거른다 */
  epoch: number;
  /** 엔진의 빌드 — 뷰어와 같은 빌드끼리만 만난다 */
  build: string;
  state: InstanceState;
  /** 비우는 가운데 — 새 세션을 받지 않는다(흐름 6 의 drain) */
  draining: boolean;
  /** 죽은 셈 — 흐름 12 가 올리고, 띄워서 ready 가 되면 0 */
  restarts: number;
}

/** 인스턴스 이름의 번호 — `<존>-<번호>`. 아니면 null. */
export const numberOf = (zone: string, name: string): number | null => {
  if (!name.startsWith(`${zone}-`)) return null;
  const n = Number(name.slice(zone.length + 1));
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** lease 의 holder(NodeRpc 의 약속) — 다시 띄운 인스턴스는 앞 세대의 lease 를 들지 않는다. */
export const holderOf = (i: Pick<Instance, 'name' | 'epoch'>): string => leaseHolder(i.name, i.epoch);
