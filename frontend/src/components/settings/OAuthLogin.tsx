import { ExternalLink, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LoginState } from '../../../../shared/providers';
import { request } from '../../api';
import { formatError, serviceMessage } from '../../i18n';

export default function OAuthLogin({
  providerId,
  chatgpt,
  autoStart,
  connected,
  onChanged,
}: {
  providerId: string;
  chatgpt: boolean;
  autoStart?: boolean;
  connected: boolean;
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation('settings');
  const [attempt, setAttempt] = useState<LoginState | null>(null);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<unknown>('');
  const [busy, setBusy] = useState(false);
  const id = useRef('');
  const started = useRef(false);
  const opened = useRef('');
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  async function start() {
    setBusy(true);
    setError('');
    try {
      const next = await request<LoginState>(`/providers/${providerId}/login`, 'POST');
      id.current = next.id;
      setAttempt(next);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void start();
    }
    return () => {
      if (id.current) void request(`/provider-logins/${id.current}`, 'DELETE').catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!attempt || attempt.status !== 'waiting') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await request<LoginState>(`/provider-logins/${id.current}`);
        if (stopped) return;
        setAttempt(next);
        if (next.browserReady && opened.current !== next.id) {
          opened.current = next.id;
          await request(`/provider-logins/${next.id}/open`, 'POST').catch(setError);
        }
        if (next.status === 'connected') {
          id.current = '';
          await onChangedRef.current();
        } else if (next.status === 'waiting') timer = setTimeout(poll, 1000);
      } catch (e) {
        if (!stopped) setError(e);
      }
    }
    timer = setTimeout(poll, 100);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [attempt?.id, attempt?.status]);
  const waiting = attempt?.status === 'waiting';
  return (
    <div className="oauth-login">
      <p>{t('oauthHint')}</p>
      {!waiting && (
        <button
          type="button"
          className={chatgpt ? 'chatgpt-login' : 'primary'}
          disabled={busy}
          onClick={() => void start()}
        >
          {connected ? t('reconnect') : chatgpt ? t('continueChatGPT') : t('signIn')}
        </button>
      )}
      {waiting && (
        <div className="oauth-waiting">
          <div className="oauth-progress">
            <LoaderCircle size={18} className="spin" />
            <strong>{t('waiting')}</strong>
          </div>
          {attempt.userCode && (
            <div className="oauth-device-code">
              <span>{t('deviceCode')}</span>
              <code>{attempt.userCode}</code>
            </div>
          )}
          {attempt.browserReady && (
            <button
              type="button"
              onClick={() =>
                void request(`/provider-logins/${attempt.id}/open`, 'POST').catch(setError)
              }
            >
              <ExternalLink size={14} />
              {t('openBrowser')}
            </button>
          )}
          {attempt.prompt && (
            <div className="oauth-prompt">
              <label>
                {attempt.prompt.message}
                {attempt.prompt.options ? (
                  <select value={answer} onChange={(e) => setAnswer(e.target.value)}>
                    <option value="">{t('choose')}</option>
                    {attempt.prompt.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    autoComplete="off"
                    type={attempt.prompt.type === 'secret' ? 'password' : 'text'}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                )}
              </label>
              <button
                type="button"
                onClick={() =>
                  void request(`/provider-logins/${attempt.id}/answer`, 'POST', {
                    promptId: attempt.prompt!.id,
                    value: answer,
                  })
                    .then(() => setAnswer(''))
                    .catch(setError)
                }
              >
                {t('continue')}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() =>
              void request(`/provider-logins/${attempt.id}`, 'DELETE')
                .then(() => setAttempt({ ...attempt, status: 'cancelled' }))
                .catch(setError)
            }
          >
            {t('cancel')}
          </button>
        </div>
      )}
      {attempt?.status === 'connected' && (
        <p role="status" className="connection-status ready">
          {t('signedIn')}
        </p>
      )}
      {attempt?.status === 'failed' && (
        <p role="alert" className="settings-error">
          {serviceMessage(attempt.errorCode)}
        </p>
      )}
      {Boolean(error) && (
        <p role="alert" className="settings-error">
          {formatError(error)}
        </p>
      )}
    </div>
  );
}
