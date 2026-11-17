import type { ChangeNotice } from '../shared/contracts.js';

export type ChangeInput = Partial<ChangeNotice>;
/** Records a change. Called without an argument, it marks only the overview as changed. */
export type Changed = (change?: ChangeInput) => void;

const areas = ['sessions', 'files', 'research', 'jobs'] as const;

/** Combines changes within `delayMs`, so a streaming turn sends at most one event per window. */
export function createChangeFeed(emit: (notice: ChangeNotice) => void, delayMs = 100) {
  let pending: ChangeNotice | undefined;
  let timer: NodeJS.Timeout | undefined;
  let closed = false;
  const flush = () => {
    const notice = pending;
    pending = undefined;
    timer = undefined;
    if (notice) emit(notice);
  };
  const changed: Changed = (change = { overview: true }) => {
    if (closed) return;
    pending ??= { overview: false, sessions: [], files: [], research: [], jobs: [], alerts: [] };
    if (change.overview) pending.overview = true;
    pending.alerts.push(...(change.alerts || []));
    for (const area of areas)
      for (const id of change[area] || []) if (!pending[area].includes(id)) pending[area].push(id);
    timer ??= setTimeout(flush, delayMs);
  };
  return {
    changed,
    /** Drops pending changes and ignores later ones while the service shuts down. */
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
      pending = undefined;
    },
  };
}
