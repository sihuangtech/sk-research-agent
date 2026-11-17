import type { ChangeNotice } from '../../../shared/contracts';

/** Areas waiting to be loaded. `full` reloads everything, e.g. after a reconnect. */
export interface PendingRefresh {
  full: boolean;
  overview: boolean;
  sessions: Set<string>;
  files: Set<string>;
  research: Set<string>;
  jobs: Set<string>;
}
const areas = ['sessions', 'files', 'research', 'jobs'] as const;

/** Adds a notice to the queued work. `null` asks for a full reload. */
export function queueRefresh(pending: PendingRefresh | null, notice: ChangeNotice | null) {
  const next: PendingRefresh = pending || {
    full: false,
    overview: false,
    sessions: new Set(),
    files: new Set(),
    research: new Set(),
    jobs: new Set(),
  };
  if (!notice) next.full = true;
  else {
    if (notice.overview) next.overview = true;
    for (const area of areas) for (const id of notice[area]) next[area].add(id);
  }
  return next;
}
export function sessionNotice(sessionId: string): ChangeNotice {
  return { overview: false, sessions: [sessionId], files: [], research: [], jobs: [] };
}
/** Reads one SSE `data:` payload. An unreadable notice falls back to a full reload. */
export function parseNotice(data: string): ChangeNotice | null {
  try {
    const notice = JSON.parse(data) as Partial<ChangeNotice>;
    if (typeof notice.overview !== 'boolean') return null;
    for (const area of areas) if (!Array.isArray(notice[area])) return null;
    return notice as ChangeNotice;
  } catch {
    return null;
  }
}
