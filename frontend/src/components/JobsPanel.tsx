import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Job } from '../../../shared/contracts';
import { request } from '../api';
import { formatDate, serviceMessage } from '../i18n';

import { useWorkbench } from '../state/WorkbenchContext';

export default function JobsPanel() {
  const { t } = useTranslation();

  const { projectId, project, act, jobsRevision, setError } = useWorkbench();
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => setJobs([]), [projectId]);
  // Logs are loaded only while this panel is open, and again whenever this project's jobs change.
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    void request<Job[]>(`/projects/${projectId}/jobs`, 'GET', undefined, controller.signal)
      .then(setJobs)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error);
      });
    return () => controller.abort();
  }, [projectId, jobsRevision, setError]);
  return (
    <section className="panel-content">
      <h2>{t('jobsTitle')}</h2>
      <p className="muted">{t('jobsDescription')}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const form = e.currentTarget;
          void act(async () => {
            await request(`/projects/${projectId}/jobs`, 'POST', {
              command: f.get('command'),
            });
            form.reset();
          });
        }}
      >
        <textarea
          name="command"
          aria-label={t('command')}
          placeholder={t('commandPlaceholder')}
          required
        />
        <button className="primary" disabled={!project}>
          {t('runCommand')}
        </button>
      </form>
      {jobs.map((j) => (
        <details className="record" key={j.id}>
          <summary>
            <span className={`status ${j.status}`}>{t(`status.${j.status}`)}</span>
            <code>{j.command}</code>
          </summary>
          <small>
            {formatDate(j.createdAt)} · {j.id.slice(0, 8)}
          </small>
          {j.noticeCode && <p>{serviceMessage(j.noticeCode)}</p>}
          <pre>{j.log || t('waitingOutput')}</pre>
          {j.status === 'running' && (
            <button onClick={() => void act(() => request(`/jobs/${j.id}/cancel`, 'POST'))}>
              {t('cancelJob')}
            </button>
          )}
        </details>
      ))}
    </section>
  );
}
