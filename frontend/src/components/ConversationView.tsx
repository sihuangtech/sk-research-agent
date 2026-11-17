import { ChevronRight, RefreshCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatError } from '../i18n';
import { useWorkbench } from '../state/WorkbenchContext';
import AlertCards from './AlertCards';
import Composer from './Composer';
import Messages from './Messages';
import Welcome from './Welcome';

export default function ConversationView() {
  const { t } = useTranslation();

  const { sessionId, error, setError, refresh, project } = useWorkbench();
  return (
    <main className="conversation">
      {' '}
      <header className="workspace-header">
        <div>
          <span className="muted">{t('workspace')}</span>
          <ChevronRight size={14} />
          <strong>{project?.name || t('noProject')}</strong>
        </div>
        <button
          className="icon-button"
          title={t('refresh')}
          aria-label={t('refresh')}
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} />
        </button>
      </header>
      {Boolean(error) && (
        <div role="alert" className="error-banner">
          {formatError(error)}
          <button aria-label={t('dismiss')} onClick={() => setError('')}>
            <X size={16} />
          </button>
        </div>
      )}
      <div className="chat-scroll">
        {!sessionId && <Welcome />}
        <Messages />
      </div>
      <Composer />
      <AlertCards />
    </main>
  );
}
