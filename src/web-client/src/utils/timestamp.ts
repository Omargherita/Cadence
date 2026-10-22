/**
 * Parses timestamps in formats like "00:12", "01:30 - 01:45", "1:15" into seconds.
 */
export function parseTimestampToSeconds(timestampStr: string): number {
  if (!timestampStr) return 0;

  const match = timestampStr.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    return minutes * 60 + seconds;
  }

  const secondsOnly = timestampStr.match(/(\d+)\s*s/i);
  if (secondsOnly) {
    return parseInt(secondsOnly[1], 10);
  }

  return 0;
}
