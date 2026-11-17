import { useTranslation } from 'react-i18next';
import { request } from '../api';

import { useWorkbench } from '../state/WorkbenchContext';

export default function MemoryPanel() {
  const { t } = useTranslation();
  const { t: partner } = useTranslation('partner');

  const { data, projectId, project, act } = useWorkbench();
  const visible = data.memories.filter((m) => !m.projectId || m.projectId === projectId);
  return (
    <section className="panel-content">
      <h2>{t('memoryTitle')}</h2>
      <p className="muted">{t('memoryDescription')}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const form = e.currentTarget;
          void act(async () => {
            await request('/memories', 'POST', {
              content: f.get('content'),
              projectId: f.get('scope') === 'project' ? projectId : null,
              source: 'user',
            });
            form.reset();
          });
        }}
      >
        <textarea
          name="content"
          aria-label={t('memoryContent')}
          placeholder={t('memoryPlaceholder')}
          required
        />
        <select name="scope" aria-label={t('memoryScope')}>
          <option value="project">{t('currentProject')}</option>
          <option value="personal">{t('personalScope')}</option>
        </select>
        <button className="primary" disabled={!project}>
          {t('saveMemory')}
        </button>
      </form>
      {visible
        .filter((m) => m.status === 'proposed')
        .map((m) => (
          <div className="record memory-proposal" key={m.id}>
            <small>{partner('proposedTitle')}</small>
            <p>{m.content}</p>
            {m.reason && <small>{partner('proposedReason', { reason: m.reason })}</small>}
            <div className="record-actions">
              <button
                className="primary"
                onClick={() => void act(() => request(`/memories/${m.id}/confirm`, 'POST'))}
              >
                {partner('confirmMemory')}
              </button>
              <button onClick={() => void act(() => request(`/memories/${m.id}`, 'DELETE'))}>
                {partner('dismissMemory')}
              </button>
            </div>
          </div>
        ))}
      {visible
        .filter((m) => m.status !== 'proposed')
        .map((m) => (
          <div className="record" key={m.id}>
            <small>
              {m.projectId ? t('projectMemory') : t('personalMemory')} ·{' '}
              {m.source === 'user' ? t('userEntered') : m.source}
            </small>
            <textarea
              aria-label={t('editMemory')}
              defaultValue={m.content}
              onBlur={(e) => {
                if (e.target.value !== m.content)
                  void act(() =>
                    request(`/memories/${m.id}`, 'PUT', {
                      content: e.target.value,
                      source: m.source,
                    }),
                  );
              }}
            />
            <button
              className="text-button"
              onClick={() => void act(() => request(`/memories/${m.id}`, 'DELETE'))}
            >
              {t('delete')}
            </button>
          </div>
        ))}
    </section>
  );
}
