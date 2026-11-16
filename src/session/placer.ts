// Placer — 그 존에서 슬롯이 빈 인스턴스를 고른다 (design/02-roles/session.md 의 Placer, 흐름 3 의 6 · 5 의 14 · 11 의 6).

import type { Sessions } from './sessions';
import type { Zone } from './zone';

export class Placer {
  // 데이터 — sessions(참조) · ready(플릿의 기능 — 앱이 준다)
  readonly sessions: Sessions;
  readonly ready: (zone: string) => readonly { readonly name: string; readonly build: string }[];

  constructor(sessions: Sessions, ready: (zone: string) => readonly { readonly name: string; readonly build: string }[]) {
    this.sessions = sessions;
    this.ready = ready;
  }

  /** pick — 그 존의 ready 인 인스턴스 가운데 빌드가 같고 잡힌 슬롯이 상한보다 작은 것. 여럿이면 가장 찬 것(사람이 모이게). 없으면 null. */
  pick(zone: Zone, build: string): { readonly instance: string; readonly count: number } | null {
    let best: { instance: string; count: number } | null = null;
    for (const i of this.ready(zone.name)) {
      if (i.build !== build) continue;
      const count = this.sessions.count(i.name);
      if (count >= zone.capacity) continue;
      if (best === null || count > best.count) best = { instance: i.name, count };
    }
    return best;
  }
}
