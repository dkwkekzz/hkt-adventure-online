// 서비스 프로세스 — npm start [-- config.json]. Service.start(흐름 1) · stdin 한 줄은 Operator.command(흐름 6) · SIGINT · SIGTERM 은 Service.stop(흐름 7).
//
//   HOST_AUTH_KEY=… npm start                    service.config.json · 엔진은 engine/(npm run engine 이 세운다)
//   HOST_AUTH_KEY=… PORT=8000 SERVICE_PUBLIC_HOST=play.example.com SERVICE_SECURE=1 npm start
//   MONITOR_PORT=8001 — Monitor 의 내부 주소(흐름 14). /observe/page 가 관측 페이지
//   MONGODB_URI=mongodb://…/hkt — 표 · 캐릭터 · lease · 잠금을 MongoDB 에. SNAPSHOT_URI=s3://<bucket>/<prefix>(+ S3_ENDPOINT · AWS_*) — Store 를 object storage 에.
//   없는 쪽은 storageRoot(SERVICE_STORAGE)의 디렉터리
//
//   stdin: shards · status <world> · start <world> · stop <world> · host <world> <Console 글> · backup <world> · restore <world> <백업> · revoke-port <world> · help

import { createInterface } from 'node:readline';
import { AUTH_ENV } from '../../protocol/engine';
import { loadConfig } from './config';
import { Service } from './service';

async function main(): Promise<void> {
  const file = process.argv[2] ?? 'service.config.json';
  const config = loadConfig(file);
  const service = await Service.start(config, process.env[AUTH_ENV]);
  console.log(`service · http://localhost:${service.port}/ · 엔진 ${config.fleet.engineDir} · 데이터셋 ${config.fleet.dataset} · 포트 ${config.fleet.ports.join('-')} · 스토리지 ${service.storage.where}`);
  console.log(`관측 · http://localhost:${service.monitor.port}/observe/page · /health · /metrics (내부 주소)`);
  console.log(`샤드 ${service.fleet.shards.size} (전부 stopped) · 명령: help`);

  const rl = createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    void service.fleet.operator.command(line).then((answer) => answer !== '' && console.log(answer));
  });
  const quit = (): void => {
    console.log('종료 — 샤드를 내린다');
    void service.stop().then(() => process.exit(0));
  };
  process.on('SIGINT', quit);
  process.on('SIGTERM', quit);
}

main().catch((e: unknown) => {
  console.error(`[service] ${(e as Error).message}`);
  process.exit(1);
});
