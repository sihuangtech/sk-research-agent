import { FolderOpen, MessageSquare, Plus, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import packageInfo from '../../../package.json';

import { useWorkbench } from '../state/WorkbenchContext';
import LanguageSwitcher from './LanguageSwitcher';

export default function Sidebar() {
  const { t } = useTranslation();
  const { t: settingsText } = useTranslation('settings');

  const {
    data,
    projectId,
    setProjectId,
    sessionId,
    setSessionId,
    setSnapshot,
    setSettings,
    online,
    sessions,
    chooseProject,
  } = useWorkbench();
  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand-mark" src="/brand/app-icon.png?v=2" alt="" aria-hidden="true" />
        <div>
          <strong>{t('brand')}</strong>
          <small>{t('agent')}</small>
        </div>
      </div>
      <button
        className="new-session"
        onClick={() => {
          setSessionId('');
          setSnapshot(null);
        }}
      >
        <Plus size={16} /> {t('newSessionAction')} <span>⌘ N</span>
      </button>
      <div className="section-label">
        {t('workspace')}{' '}
        <button
          aria-label={t('openProject')}
          title={t('openProject')}
          onClick={() => void chooseProject()}
        >
          <Plus size={15} />
        </button>
      </div>
      <div className="project-list">
        {data.projects.map((p) => (
          <button
            key={p.id}
            title={p.path}
            className={projectId === p.id ? 'project active' : 'project'}
            onClick={() => {
              setProjectId(p.id);
              setSessionId('');
            }}
          >
            <FolderOpen size={16} />
            <span>{p.name}</span>
          </button>
        ))}
      </div>
      {!data.projects.length && (
        <button className="empty-link" onClick={() => void chooseProject()}>
          {t('openFirst')}
        </button>
      )}
      <div className="section-label">
        {t('sessions')} <span>{sessions.length}</span>
      </div>
      <nav className="session-list">
        {sessions.map((s) => (
          <button
            key={s.id}
            className={sessionId === s.id ? 'session active' : 'session'}
            onClick={() => setSessionId(s.id)}
          >
            <MessageSquare size={14} />
            <span>{s.title || t('newSession')}</span>
            {s.status === 'running' && <i className="pulse" />}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <LanguageSwitcher />
        <button onClick={() => setSettings(true)}>
          <Settings2 size={16} /> {settingsText('title')}
        </button>
        <div className="local-status">
          <i className={online ? 'online' : ''} />
          {online ? t('online') : t('connecting')}
          <span>{packageInfo.version}</span>
        </div>
      </div>
    </aside>
  );
}
