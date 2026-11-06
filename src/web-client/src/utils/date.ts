const pad2 = (n: number) => String(n).padStart(2, '0');

/** Formats a Date as YYYY-MM-DD using the *local* calendar day (never UTC). */
export function toLocalIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function getTodayIsoDate(): string {
  return toLocalIsoDate(new Date());
}

/** Parses YYYY-MM-DD as a local-midnight Date (new Date('YYYY-MM-DD') would be UTC midnight). */
export function parseIsoDateLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Calendar arithmetic on YYYY-MM-DD strings, immune to timezone/DST shifts. */
export function addDaysToIsoDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

/** Next Monday–Friday strictly after the given date (mirrors the backend's GetNextWeekday). */
export function getNextWeekdayIso(iso: string): string {
  let next = addDaysToIsoDate(iso, 1);
  for (;;) {
    const [y, m, d] = next.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (dow !== 0 && dow !== 6) return next;
    next = addDaysToIsoDate(next, 1);
  }
}

export function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return 'Never practiced';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
