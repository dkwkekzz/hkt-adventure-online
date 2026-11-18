// NodeReporter — 이 노드가 든 것을 컨트롤 플레인에 알린다 (design/02-roles/fleet.md 의 NodeReporter, 흐름 1 의 10 · 5 의 4 · 7 의 1 · 13 의 4).
// 보내는 것은 NodeRpc register · report(protocol/node.ts) — 받는 쪽은 앱이 준 ControlSocket(개발의 main 에서는 함수, 갈리면 내부망의 글).

import type { ControlSocket, InstanceReport, NodeHello, NodeReport } from '../protocol/node';
import type { Loader } from './loader';
import type { Runner } from './runner';

export class NodeReporter {
  // 데이터 — name(불변) · runner(참조) · closing
  readonly name: string;
  readonly runner: Runner;
  closing = false;
  private readonly hello: NodeHello;
  private readonly loader: Loader;
  private readonly control: ControlSocket;

  constructor(hello: NodeHello, runner: Runner, loader: Loader, control: ControlSocket) {
    this.name = hello.name;
    this.hello = hello;
    this.runner = runner;
    this.loader = loader;
    this.control = control;
  }

  /** register — 이름 · 주소 · 빌드 · slots 를 알린다. */
  register(run: string): NodeHello {
    this.control.register(this.hello, run);
    return this.hello;
  }

  /** report — closing 과 인스턴스마다 state · 사람 수 · 틱 지연 · 로드된 캐릭터들을 알린다. 알린 글을 준다. */
  report(run: string): NodeReport {
    const instances: InstanceReport[] = [];
    for (const s of this.runner.servers.values()) {
      if (s.state !== 'starting' && s.state !== 'ready' && s.state !== 'stopping') continue;
      instances.push({ name: s.name, epoch: s.epoch, state: s.state, port: s.port, players: s.players, lag: s.lag, idle: s.idle, loaded: this.loader.of(s.name) });
    }
    const report: NodeReport = { name: this.name, hello: this.hello, closing: this.closing, instances };
    this.control.report(report, run);
    return report;
  }
}
