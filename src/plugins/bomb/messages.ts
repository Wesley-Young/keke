import { formatDurationSeconds } from '../../util/rules';

export function formatBombMuteResult(
  muteOk: boolean,
  muteSeconds: number,
): string {
  return muteOk ? formatDurationSeconds(muteSeconds) : '未生效';
}
