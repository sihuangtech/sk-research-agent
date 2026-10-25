import { CircleUserRound, Globe2, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Provider } from '../../../../shared/contracts';
import LanguageSwitcher from '../LanguageSwitcher';
import Connections from './Connections';
import { defaultConnectionKey, preferredConnection } from '../../preferences';

export default function SettingsDialog({
  providers,
  onClose,
  onSaved,
}: {
  providers: Provider[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation('settings');
  const [section, setSection] = useState<'connections' | 'general' | 'privacy'>('connections');
  const dialog = useRef<HTMLDialogElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const navigate = () => {
    content.current?.scrollTo({ top: 0 });
    content.current?.focus({ preventScroll: true });
  };
  const [defaultId, setDefaultId] = useState(preferredConnection);
  useEffect(() => {
    const focus = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      focus?.focus();
    };
  }, []);
  const sections = [
    { id: 'general', label: t('general'), icon: Globe2 },
    { id: 'connections', label: t('connections'), icon: CircleUserRound },
    { id: 'privacy', label: t('privacy'), icon: ShieldCheck },
  ] as const;
  return (
    <dialog
      ref={dialog}
      className="settings-dialog"
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <aside className="settings-nav">
        <div className="settings-brand">
          <img src="/brand/app-icon.png?v=2" alt="" />
          <span>{t('workspaceSettings')}</span>
        </div>
        <h2 id="settings-title">{t('title')}</h2>
        <nav aria-label={t('title')}>
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={section === id ? 'active' : ''}
              aria-current={section === id ? 'page' : undefined}
              onClick={() => {
                setSection(id);
                navigate();
              }}
            >
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
        <div className="settings-nav-foot">
          <span className="settings-dot" />
          {t('localFirst')}
        </div>
      </aside>
      <button className="settings-close" onClick={onClose} aria-label={t('close')}>
        <X size={19} />
      </button>
      <div className="settings-content" ref={content} tabIndex={-1}>
        {section === 'connections' && (
          <Connections providers={providers} onSaved={onSaved} onNavigate={navigate} />
        )}
        {section === 'general' && (
          <>
            <header className="settings-heading">
              <span className="eyebrow">{t('workspaceSettings')}</span>
              <h2>{t('general')}</h2>
              <p>{t('generalIntro')}</p>
            </header>
            <div className="settings-row">
              <div>
                <h3>{t('language')}</h3>
                <p>{t('languageHint')}</p>
              </div>
              <LanguageSwitcher />
            </div>
            <div className="settings-row">
              <div>
                <h3>{t('defaultConnection')}</h3>
                <p>{t('defaultHint')}</p>
              </div>
              <select
                value={defaultId}
                aria-label={t('defaultConnection')}
                onChange={(event) => {
                  setDefaultId(event.target.value);
                  localStorage.setItem(defaultConnectionKey, event.target.value);
                  window.dispatchEvent(new Event('second-moon-preferences'));
                }}
              >
                <option value="">{t('lastSelected')}</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="settings-row">
              <div>
                <h3>{t('appearance')}</h3>
                <p>{t('darkHint')}</p>
              </div>
              <span className="connection-badge">{t('dark')}</span>
            </div>
          </>
        )}
        {section === 'privacy' && (
          <>
            <header className="settings-heading">
              <span className="eyebrow">{t('localFirst')}</span>
              <h2>{t('privacy')}</h2>
              <p>{t('privacyIntro')}</p>
            </header>
            {(
              [
                'credentialSafety',
                'networkBoundary',
                'executionBoundary',
                'billingBoundary',
              ] as const
            ).map((key) => (
              <div className="settings-policy" key={key}>
                <ShieldCheck size={18} />
                <p>{t(key)}</p>
              </div>
            ))}
          </>
        )}
      </div>
    </dialog>
  );
}
