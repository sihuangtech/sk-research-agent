import { Moon, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWorkbench } from '../state/WorkbenchContext';

/** In-app cards for what Second Moon wants to tell the researcher. */
export default function AlertCards() {
  const { t } = useTranslation('partner');
  const { alerts, dismissAlert, describeAlert, setSessionId, setProjectId, setPanel } =
    useWorkbench();
  if (!alerts.length) return null;
  return (
    <div className="alert-cards" role="status">
      {alerts.map((alert) => (
        <div className={`alert-card ${alert.kind}`} key={alert.id}>
          <Moon size={14} />
          <p>{describeAlert(alert)}</p>
          {(alert.sessionId || alert.kind === 'memoryProposed') && (
            <button
              onClick={() => {
                setProjectId(alert.projectId);
                if (alert.kind === 'memoryProposed') setPanel('memory');
                else setSessionId(alert.sessionId!);
                dismissAlert(alert.id);
              }}
            >
              {t('openSession')}
            </button>
          )}
          <button aria-label={t('dismiss')} onClick={() => dismissAlert(alert.id)}>
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
