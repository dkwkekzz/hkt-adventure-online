// GateReporter — 이 게이트웨이가 든 접속을 컨트롤 플레인에 알린다 (design/02-roles/gateway.md 의 GateReporter, 흐름 1 의 5 · 5 의 6 · 7 의 7).

import type { GateReport, Report } from '../protocol/session';
import type { Connection } from './connection';

export class GateReporter {
  // 데이터 — name · address(불변) · closing
  readonly name: string;
  readonly address: string;
  closing = false;
  private readonly send: Report;

  constructor(name: string, address: string, send: Report) {
    this.name = name;
    this.address = address;
    this.send = send;
  }

  /** report — 이름 · 주소 · closing 과 접속마다 {캐릭터, 이어진 인스턴스}. 보낸 글을 준다. */
  report(connections: Iterable<Connection>): GateReport {
    const r: GateReport = {
      name: this.name,
      address: this.address,
      closing: this.closing,
      connections: [...connections].map((c) => ({ character: c.character, instance: c.instance })),
    };
    this.send(r);
    return r;
  }
}
