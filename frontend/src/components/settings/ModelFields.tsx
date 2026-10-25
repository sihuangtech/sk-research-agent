import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Provider } from '../../../../shared/contracts';
import type { ModelChoice } from '../../../../shared/providers';

export default function ModelFields({
  draft,
  setDraft,
  models,
  refresh,
  busy,
  editable,
}: {
  draft: Provider;
  setDraft: (value: Provider) => void;
  models: ModelChoice[];
  refresh: () => void;
  busy: boolean;
  editable: boolean;
}) {
  const { t } = useTranslation('settings');
  return (
    <>
      <div className="settings-section-title">
        <h3>{t('model')}</h3>
        <button type="button" disabled={busy} onClick={refresh}>
          <RefreshCw size={13} />
          {t('refreshModels')}
        </button>
      </div>
      <label>
        {t('model')}
        <input
          list="connection-models"
          value={draft.model}
          placeholder={t('modelPlaceholder')}
          onChange={(e) => {
            const model = models.find((m) => m.id === e.target.value);
            setDraft({
              ...draft,
              model: e.target.value,
              ...(model
                ? {
                    api: model.api,
                    contextWindow: model.contextWindow,
                    maxTokens: model.maxTokens,
                    reasoning: model.reasoning,
                    vision: model.vision,
                  }
                : {}),
            });
          }}
        />
      </label>
      <datalist id="connection-models">
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </datalist>
      {draft.model && (
        <div className="model-capabilities">
          <span>
            {draft.contextWindow.toLocaleString()} {t('context')}
          </span>
          {draft.reasoning && <span>{t('reasoning')}</span>}
          {draft.vision && <span>{t('vision')}</span>}
        </div>
      )}
      <details className="settings-advanced">
        <summary>{t('advanced')}</summary>
        <div className="settings-advanced-fields">
          <label>
            {t('endpoint')}
            <input
              type="url"
              value={draft.baseUrl}
              readOnly={!editable}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
            />
          </label>
          {editable && (
            <label>
              {t('protocol')}
              <select
                value={draft.api}
                onChange={(e) => setDraft({ ...draft, api: e.target.value as Provider['api'] })}
              >
                <option value="openai-completions">OpenAI Chat Completions</option>
                <option value="openai-responses">OpenAI Responses</option>
                <option value="anthropic-messages">Anthropic Messages</option>
                <option value="google-generative-ai">Google Generative AI</option>
              </select>
            </label>
          )}
          <div className="two-columns">
            <label>
              {t('context')}
              <input
                type="number"
                min="2048"
                value={draft.contextWindow}
                readOnly={!editable}
                onChange={(e) => setDraft({ ...draft, contextWindow: Number(e.target.value) })}
              />
            </label>
            <label>
              {t('output')}
              <input
                type="number"
                min="128"
                value={draft.maxTokens}
                readOnly={!editable}
                onChange={(e) => setDraft({ ...draft, maxTokens: Number(e.target.value) })}
              />
            </label>
          </div>
          {editable && (
            <div className="settings-checks">
              <label>
                <input
                  type="checkbox"
                  checked={!!draft.reasoning}
                  onChange={(e) => setDraft({ ...draft, reasoning: e.target.checked })}
                />
                {t('reasoning')}
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!!draft.vision}
                  onChange={(e) => setDraft({ ...draft, vision: e.target.checked })}
                />
                {t('vision')}
              </label>
            </div>
          )}
          <p className="muted">{t('metadataHint')}</p>
        </div>
      </details>
    </>
  );
}
