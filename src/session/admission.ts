// Admission — 그 캐릭터가 지금 들어와도 되는가를 본다 (design/02-roles/session.md 의 Admission, 흐름 3 의 3).
// 계정의 기능 둘(owner · banned)은 앱이 준다. 한 계정은 한때에 캐릭터 하나 — 나중 입장이 이긴다.

import type { Router } from './router';
import type { Session } from './session';
import type { Sessions } from './sessions';

export interface Admitted {
  readonly character: string;
  readonly account: string;
  readonly name: string;
  /** 내보낸 같은 계정의 다른 캐릭터의 세션들 */
  readonly evicted: readonly Session[];
}

export class Admission {
  // 데이터 — owner · banned(계정의 기능 — 앱이 준다) · sessions · router(참조)
  readonly owner: (character: string) => Promise<{ readonly account: string; readonly name: string } | null>;
  readonly banned: (account: string) => Promise<boolean>;
  readonly sessions: Sessions;
  readonly router: Router;

  constructor(owner: Admission['owner'], banned: Admission['banned'], sessions: Sessions, router: Router) {
    this.owner = owner;
    this.banned = banned;
    this.sessions = sessions;
    this.router = router;
  }

  /** check — 줄이 없거나 차단됐으면 { why }(차단이면 누구인지도 — 흔적이 그 사람의 줄에 남는다). 같은 계정의 다른 캐릭터가 세션을 들고 있으면 지우고 그 접속을 닫게 한다(4000). 스토리지에 닿지 않으면 던진다. */
  async check(character: string, run: string): Promise<Admitted | { readonly why: string; readonly account?: string; readonly name?: string }> {
    const row = await this.owner(character);
    if (row === null) return { why: '캐릭터가 없다 — 캐릭터를 다시 고른다' };
    if (await this.banned(row.account)) return { why: '차단된 계정이다', account: row.account, name: row.name };
    const evicted: Session[] = [];
    for (const s of this.sessions.held(row.account)) {
      if (s.character === character) continue;
      this.sessions.drop(s.character);
      this.router.kick(s, 4000, run);
      evicted.push(s);
    }
    return { character, account: row.account, name: row.name, evicted };
  }
}
