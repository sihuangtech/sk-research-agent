import { useTranslation } from 'react-i18next';
import { request } from '../api';
import { formatDate } from '../i18n';

import { useWorkbench } from '../state/WorkbenchContext';

export default function AutomationsPanel() {
  const { t } = useTranslation();
  const { t: partner } = useTranslation('partner');

  const { data, projectId, setSessionId, providerId, project, act } = useWorkbench();
  return (
    <section className="panel-content">
      <h2>{t('automationsTitle')}</h2>
      <p className="muted">{t('automationsDescription')}</p>
      <div className="record brief-card">
        <strong>{partner('briefTitle')}</strong>
        <p>{partner('briefDescription')}</p>
        {data.automations.some((a) => a.projectId === projectId && a.profile === 'review') ? (
          <small>{partner('briefEnabled')}</small>
        ) : (
          <button
            className="primary"
            disabled={!project || !providerId}
            onClick={() =>
              void act(() => request(`/projects/${projectId}/brief`, 'POST', { providerId }))
            }
          >
            {partner('briefEnable')}
          </button>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const form = e.currentTarget;
          void act(async () => {
            await request('/automations', 'POST', {
              projectId,
              providerId,
              name: f.get('name'),
              prompt: f.get('prompt'),
              intervalMinutes: Number(f.get('interval')),
            });
            form.reset();
          });
        }}
      >
        <input name="name" aria-label={t('taskName')} placeholder={t('taskName')} required />
        <textarea
          name="prompt"
          aria-label={t('automationPrompt')}
          placeholder={t('automationPlaceholder')}
          required
        />
        <label>
          {t('interval')}
          <input type="number" name="interval" min={5} max={525600} defaultValue={1440} required />
        </label>
        <button className="primary" disabled={!project || !providerId}>
          {t('createAutomation')}
        </button>
      </form>
      {data.automations
        .filter((a) => a.projectId === projectId)
        .map((a) => (
          <div className="record" key={a.id}>
            <strong>{a.name}</strong>
            <p>{a.prompt}</p>
            <small>
              {a.enabled ? t('nextRun', { date: formatDate(a.nextRunAt) }) : t('paused')}
            </small>
            <div className="record-actions">
              <button
                onClick={() =>
                  void act(() => request(`/automations/${a.id}`, 'PATCH', { enabled: !a.enabled }))
                }
              >
                {a.enabled ? t('pause') : t('enable')}
              </button>
              {a.lastSessionId && (
                <button onClick={() => setSessionId(a.lastSessionId!)}>{t('viewResults')}</button>
              )}
              <button onClick={() => void act(() => request(`/automations/${a.id}`, 'DELETE'))}>
                {t('delete')}
              </button>
            </div>
          </div>
        ))}
    </section>
  );
}
