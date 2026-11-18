// 서비스 프로세스 — npm start [-- config.json] [--role main|api|gateway|control|node]. Service.start(흐름 1) · SIGINT · SIGTERM 은 Service.stop(흐름 7).
// 컨트롤 플레인(control · main)의 stdin 한 줄은 운영자의 콘솔 — OPERATOR_KEY 로 낸 콘솔의 토큰(설정의 operators 의 첫 이름)으로 Operator.command(흐름 6).
//
//   HOST_AUTH_KEY=… OPERATOR_KEY=… npm start                     넷을 한 프로세스에(main) — service.config.json · 엔진은 engine/(npm run engine)
//   HOST_AUTH_KEY=… npm start -- --role api                       API 서버 · 게이트웨이 · 노드는 컨트롤 플레인을 스토리지의 자리(LeaderLock)로 찾는다
//   HOST_AUTH_KEY=… OPERATOR_KEY=… npm start -- --role control    컨트롤 플레인 — 둘을 띄우면 하나가 활성, 하나가 대기(흐름 13)
//   HOST_AUTH_KEY=… NODE_NAME=node-2 NODE_PORT=8021 SERVICE_STORAGE=… npm start -- --role node
//   MONITOR_PORT · PORT · GATE_PORT · CONTROL_PORT · NODE_PORT · GATE_RPC_PORT · SERVICE_INTERNAL_HOST — 한 서버에 여럿이면 포트를 갈라 준다
//   MONGODB_URI=mongodb://…/hkt · SNAPSHOT_URI=s3://<bucket>/<prefix>(+ S3_ENDPOINT · AWS_*) — 프로세스가 여럿이면 같은 스토리지를 같이 쓴다

import { createInterface } from 'node:readline';
import { AUTH_ENV } from '../../protocol/engine';
import { loadConfig } from './config';
import { Service } from './service';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const at = args.indexOf('--role');
  if (at >= 0) process.env['SERVICE_ROLE'] = args.splice(at, 2)[1];
  const file = args[0] ?? 'service.config.json';
  const config = loadConfig(file);
  const service = await Service.start(config, process.env[AUTH_ENV], (l) => console.log(l), process.env['OPERATOR_KEY']);
  const role = service.role;
  console.log(`service ${role} · 엔진 ${config.fleet.engineDir} · 빌드 ${config.build} · 스토리지 ${service.storage.where}`);
  if (service.api !== null) console.log(`api · http://localhost:${service.port}/ · 존 ${config.zones.map((z) => `${z.name}(${z.dataset} · 상한 ${z.capacity} · 예비 ${z.spare})`).join(' ')}`);
  if (service.gateway !== null) console.log(`게이트웨이 · ${service.gateway.address} (port ${service.gateway.port}) — 클라이언트는 이 주소 하나로 붙는다${role === 'main' ? '' : ` · 내부 ${config.rpc.host}:${config.rpc.gatewayPort}`}`);
  if (service.elector !== null) console.log(`컨트롤 플레인 · ${service.elector.role} · term ${service.elector.term}${role === 'main' ? '' : ` · 내부 ${config.rpc.host}:${config.rpc.controlPort}`}`);
  const range = config.fleet.ports;
  if (service.node !== null) console.log(`노드 ${config.fleet.node.name} · slots ${config.fleet.node.slots} · 포트 ${range.join('-')}${role === 'main' ? '' : ` · 내부 ${config.rpc.host}:${config.rpc.nodePort}`}`);
  console.log(`관측 · http://localhost:${service.monitor.port}/observe/page · /health · /metrics (내부 주소)`);

  if (service.fleet !== null) {
    const token = service.console;
    if (token !== null) console.log(`운영자의 콘솔 — stdin 한 줄(help) · 운영자 ${config.operators[0]}`);
    const rl = createInterface({ input: process.stdin });
    rl.on('line', (line) => {
      if (line.trim() === '') return;
      if (token === null) return void console.log('OPERATOR_KEY 가 없다 — 운영자의 명령은 받지 않는다');
      if (service.elector?.role === 'standby') return void console.log('대기의 컨트롤 플레인이다 — 활성의 콘솔에(흐름 13)');
      void service.operator!.command(token, line).then((answer) => answer !== '' && console.log(answer));
    });
  }
  const quit = (): void => {
    console.log(`종료 — ${role} 을 내린다`);
    void service.stop().then(() => process.exit(0));
  };
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
}

main().catch((e: unknown) => {
  console.error(`[service] ${(e as Error).message}`);
  process.exit(1);
});
