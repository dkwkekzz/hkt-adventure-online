// Operator 소켓 — 운영자(밖) → 컨트롤 플레인 (design/01-flows/06-operator.md). 글 한 줄, 답 글 한 줄.
// 지금 서는 것은 플릿의 명령이다 — 노드(nodes · cordon · uncordon · forget) · 세션(close · open · kick) · 계정(ban · unban) · 캐릭터(versions · rollback)는 plan 08.

/** 명령과 help. 인자는 존 또는 인스턴스의 이름과 그 뒤의 글. */
export const OPERATOR_COMMANDS = ['instances', 'start', 'drain', 'undrain', 'stop', 'remove', 'host', 'backup', 'restore', 'purge', 'help'] as const;
export type OperatorCommand = (typeof OPERATOR_COMMANDS)[number];

export const OPERATOR_USAGE =
  'instances [zone] · start <zone> · drain <instance> · undrain <instance> · stop <instance> · remove <instance> · host <instance> <Console 글> · backup <instance> · restore <instance> <백업> · purge <instance> · help';
