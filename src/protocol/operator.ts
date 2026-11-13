// Operator 소켓 — 운영자(밖) → 함대 (design/01-flows/06-operator.md). 글 한 줄, 답 글 한 줄.

/** 명령 여덟과 help. 인자는 세계의 이름과 그 뒤의 글. */
export const OPERATOR_COMMANDS = ['shards', 'status', 'start', 'stop', 'host', 'backup', 'restore', 'revoke-port', 'help'] as const;
export type OperatorCommand = (typeof OPERATOR_COMMANDS)[number];

export const OPERATOR_USAGE =
  'shards · status <world> · start <world> · stop <world> · host <world> <Console 글> · backup <world> · restore <world> <백업> · revoke-port <world> · help';
