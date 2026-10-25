import { Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Overview, Provider } from '../../../../shared/contracts';
import type { ModelChoice, ProviderPreset } from '../../../../shared/providers';
import { request } from '../../api';
import { formatError } from '../../i18n';
import ModelFields from './ModelFields';
import OAuthLogin from './OAuthLogin';
import ConnectionLinks from './ConnectionLinks';

export default function ConnectionEditor({
  provider,
  preset,
  onSaved,
  onRemoved,
}: {
  provider?: Provider;
  preset?: ProviderPreset;
  onSaved: () => Promise<void>;
  onRemoved: () => void;
}) {
  const { t } = useTranslation('settings');
  const [saved, setSaved] = useState(provider);
  const [draft, setDraft] = useState<Provider>(
    provider || {
      id: '',
      name: preset?.name || '',
      presetId: preset?.id,
      authMethod: preset?.authMethod,
      billing: preset?.billing,
      baseUrl: preset?.baseUrl || '',
      api: preset?.api || 'openai-completions',
      model: '',
      contextWindow: 128000,
      maxTokens: 8192,
      hasKey: false,
    },
  );
  const [models, setModels] = useState<ModelChoice[]>([]);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<unknown>('');
  const [autoLogin, setAutoLogin] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const oauth = preset?.authMethod === 'oauth';
  useEffect(() => {
    if (!preset || oauth) return;
    let cancelled = false;
    void request<ModelChoice[]>(`/provider-presets/${preset.id}/models`)
      .then((values) => {
        if (cancelled) return;
        setModels(values);
        if (!provider && values[0])
          setDraft((d) => ({
            ...d,
            model: values[0].id,
            contextWindow: values[0].contextWindow,
            maxTokens: values[0].maxTokens,
            reasoning: values[0].reasoning,
            vision: values[0].vision,
          }));
      })
      .catch(setError);
    return () => {
      cancelled = true;
    };
  }, [preset?.id]);
  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    await act(async () => {
      const next = await request<Provider>(
        saved ? `/providers/${saved.id}` : '/providers',
        saved ? 'PUT' : 'POST',
        { ...draft, apiKey: apiKey || undefined },
      );
      setSaved(next);
      setDraft(next);
      setApiKey('');
      setMessage(t('saved'));
      if (oauth && !saved) setAutoLogin(true);
      await onSaved();
    });
  }
  async function loadModels(target = saved) {
    if (!target) {
      setMessage(t('saveBeforeRefresh'));
      return;
    }
    const values = await request<ModelChoice[]>(`/providers/${target.id}/models`);
    setModels(values);
    if (!values.length) throw new Error(t('noModels'));
    if (oauth && !values.some((m) => m.id === draft.model)) {
      const first = values[0];
      const updated = await request<Provider>(`/providers/${target.id}`, 'PUT', {
        ...draft,
        model: first.id,
        contextWindow: first.contextWindow,
        maxTokens: first.maxTokens,
        reasoning: first.reasoning,
        vision: first.vision,
      });
      setSaved(updated);
      setDraft(updated);
      await onSaved();
    }
  }
  async function accountChanged() {
    await onSaved();
    const data = await request<Overview>('/overview');
    const current = data.providers.find((p) => p.id === saved?.id);
    if (current) {
      setSaved(current);
      await act(() => loadModels(current));
    }
  }
  return (
    <>
      <header className="settings-heading connection-heading">
        <span className="provider-monogram large">{(preset?.name || draft.name || '+')[0]}</span>
        <div>
          <h2>{preset?.name || t('custom')}</h2>
          <span className="connection-badge">{t(preset?.billing || 'api')}</span>
        </div>
      </header>
      <div className="connection-explainer">
        <p>
          {t(
            oauth
              ? 'subscriptionHint'
              : preset?.billing === 'coding-plan'
                ? 'planHint'
                : preset?.billing === 'local'
                  ? 'localHint'
                  : 'apiHint',
          )}
        </p>
        {preset?.interactiveOnly && <small>{t('interactiveOnly')}</small>}
        {preset && <ConnectionLinks preset={preset} act={act} />}
      </div>
      {saved?.accountLabel && (
        <p className="account-identity">
          {t('account')}: {saved.accountLabel} <small>· {saved.id.slice(0, 8)}</small>
        </p>
      )}
      <form className="connection-form" onSubmit={(e) => void save(e)}>
        <label>
          {t('name')}
          <input
            required
            maxLength={80}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        {!oauth && (
          <label>
            {t(preset?.billing === 'coding-plan' ? 'planKey' : 'apiKey')}
            <input
              type="password"
              autoComplete="new-password"
              value={apiKey}
              placeholder={t(
                saved?.hasKey
                  ? 'keyStored'
                  : preset?.authMethod === 'none'
                    ? 'keyOptional'
                    : 'keyRequired',
              )}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </label>
        )}
        {(!oauth || saved?.hasKey) && (
          <ModelFields
            draft={draft}
            setDraft={setDraft}
            models={models}
            busy={busy}
            refresh={() => void act(() => loadModels())}
            editable={!preset?.sdkProvider && preset?.billing !== 'coding-plan'}
          />
        )}
        <div className="connection-actions">
          <button
            className={oauth && !saved && preset?.id === 'chatgpt' ? 'chatgpt-login' : 'primary'}
            disabled={busy}
          >
            {oauth && !saved
              ? preset?.id === 'chatgpt'
                ? t('continueChatGPT')
                : t('signIn')
              : t('save')}
          </button>
          {saved && (
            <button
              type="button"
              disabled={busy || !draft.model || (oauth && !saved.hasKey)}
              onClick={() =>
                void act(async () => {
                  const result = await request<{ latencyMs: number }>(
                    `/providers/${saved.id}/test`,
                    'POST',
                  );
                  setMessage(t('testSuccess', { latency: result.latencyMs }));
                })
              }
            >
              {t('test')}
            </button>
          )}
        </div>
        {saved && <small className="muted">{t('testHint')}</small>}
      </form>
      {oauth && saved && (
        <OAuthLogin
          key={saved.id}
          providerId={saved.id}
          connected={saved.hasKey}
          chatgpt={preset?.id === 'chatgpt'}
          autoStart={autoLogin}
          onChanged={accountChanged}
        />
      )}
      {Boolean(message) && (
        <p role="status" className="form-message">
          {message}
        </p>
      )}
      {Boolean(error) && (
        <p role="alert" className="settings-error">
          {formatError(error)}
        </p>
      )}
      {saved && (
        <div className="connection-danger">
          {saved.hasKey && (
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const result = await request<{ revoked: boolean }>(
                    `/providers/${saved.id}/logout`,
                    'POST',
                  );
                  setSaved({ ...saved, hasKey: false });
                  setMessage(t(oauth && !result.revoked ? 'localSignOut' : 'disconnected'));
                  await onSaved();
                })
              }
            >
              {t(oauth ? 'signOut' : 'removeKey')}
            </button>
          )}
          <button
            disabled={busy || (oauth && saved.hasKey)}
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              void act(async () => {
                await request(`/providers/${saved.id}`, 'DELETE');
                onRemoved();
              });
            }}
          >
            <Trash2 size={14} />
            {t(confirmDelete ? 'confirmDelete' : 'remove')}
          </button>
        </div>
      )}
    </>
  );
}
