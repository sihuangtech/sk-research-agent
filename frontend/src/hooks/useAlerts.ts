import { isTauri } from '@tauri-apps/api/core';
import { useCallback, useRef, useState } from 'react';
import type { Alert } from '../../../shared/partner';
import { i18n } from '../i18n';

export type ShownAlert = Alert & { id: number };
const keep = 4;
const lifetime = 9000;

function describe(alert: Alert) {
  return i18n.t(`alert.${alert.kind}`, { ns: 'partner', subject: alert.subject.slice(0, 120) });
}
/** Desktop notification through the Tauri plugin, or the browser API in development. */
async function notifySystem(alert: Alert) {
  const title = i18n.t('brand');
  const body = describe(alert);
  try {
    if (isTauri()) {
      const plugin = await import('@tauri-apps/plugin-notification');
      let granted = await plugin.isPermissionGranted();
      if (!granted) granted = (await plugin.requestPermission()) === 'granted';
      if (granted) plugin.sendNotification({ title, body });
    } else if ('Notification' in window) {
      if (Notification.permission === 'default') await Notification.requestPermission();
      if (Notification.permission === 'granted') new Notification(title, { body });
    }
  } catch {
    /* Notifications are optional; the in-app card still shows. */
  }
}
/**
 * Things Second Moon wants to tell the researcher. While the window is in the background the
 * system notification carries them; in-app cards show the rest. Approvals stay until handled.
 */
export function useAlerts(openSessionId: () => string) {
  const [alerts, setAlerts] = useState<ShownAlert[]>([]);
  const next = useRef(0);
  const dismiss = useCallback((id: number) => {
    setAlerts((list) => list.filter((alert) => alert.id !== id));
  }, []);
  const push = useCallback(
    (incoming: Alert[]) => {
      const away = document.hidden || !document.hasFocus();
      const shown: ShownAlert[] = [];
      for (const alert of incoming) {
        if (away) void notifySystem(alert);
        // The researcher is already watching this conversation finish.
        const watching = !away && alert.sessionId === openSessionId();
        if (watching && (alert.kind === 'turnFinished' || alert.kind === 'turnFailed')) continue;
        shown.push({ ...alert, id: next.current++ });
      }
      if (!shown.length) return;
      setAlerts((list) => [...list, ...shown].slice(-keep));
      for (const alert of shown)
        if (alert.kind !== 'approvalNeeded') setTimeout(() => dismiss(alert.id), lifetime);
    },
    [dismiss, openSessionId],
  );
  /** Approval cards stay until the session has nothing left to approve. */
  const settleApprovals = useCallback((sessionId: string) => {
    setAlerts((list) =>
      list.some((a) => a.kind === 'approvalNeeded' && a.sessionId === sessionId)
        ? list.filter((a) => a.kind !== 'approvalNeeded' || a.sessionId !== sessionId)
        : list,
    );
  }, []);
  return {
    alerts,
    pushAlerts: push,
    dismissAlert: dismiss,
    describeAlert: describe,
    settleApprovals,
  };
}
