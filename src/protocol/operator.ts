// Operator 소켓 — 운영자(밖) → 컨트롤 플레인 (design/01-flows/06-operator.md). 운영자의 토큰과 글 한 줄, 답 글 한 줄.
// 토큰은 운영자의 것(`o<이름>` — OPERATOR_KEY 로 서명, 설정의 operators 에 있는 이름)만 받는다. 내부 주소의 http 는 머리 `authorization: Bearer <토큰>` 에 싣는다.

/** 명령과 help. 인자는 존 · 인스턴스 · 노드 · 캐릭터 · 계정의 이름과 그 뒤의 글. */
export const OPERATOR_COMMANDS = [
  'nodes',
  'instances',
  'start',
  'drain',
  'undrain',
  'stop',
  'remove',
  'host',
  'backup',
  'restore',
  'purge',
  'close',
  'open',
  'cordon',
  'uncordon',
  'forget',
  'kick',
  'ban',
  'unban',
  'versions',
  'rollback',
  'help',
] as const;
export type OperatorCommand = (typeof OPERATOR_COMMANDS)[number];

export const OPERATOR_USAGE = [
  'nodes · instances [zone] · start <zone> · drain · undrain · stop · remove <instance> · host <instance> <Console 글>',
  'backup · purge <instance> · restore <instance> <백업> · close · open <zone> · cordon · uncordon · forget <node>',
  'kick <character> · ban <account> [<until — ISO 때>] · unban <account> · versions <character> · rollback <character> <때> · help',
].join(' · ');

/** 운영자의 토큰의 id 머리 — `o<이름>`. */
export const OPERATOR_HEAD = 'o';
