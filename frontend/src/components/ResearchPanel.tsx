import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResearchEntry, ResearchOverview } from '../../../shared/research';
import { request } from '../api';
import { formatDate } from '../i18n';
import { useWorkbench } from '../state/WorkbenchContext';
import ResearchEntryCard from './ResearchEntryCard';
import ResearchEntryForm from './ResearchEntryForm';

export default function ResearchPanel() {
  const { t } = useTranslation();
  const { project, projectId, revision, setError, act } = useWorkbench();
  const [data, setData] = useState<ResearchOverview>({ entries: [], executions: [] });
  const [view, setView] = useState<'notes' | 'executions'>('notes');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<ResearchEntry | 'new' | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    void request<ResearchOverview>(
      `/projects/${projectId}/research?q=${encodeURIComponent(query)}`,
      'GET',
      undefined,
      controller.signal,
    )
      .then(setData)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId, query, revision, setError]);
  const executions = [
    ...new Map(data.executions.map((event) => [event.callId, event] as const).reverse()).values(),
  ].sort((a, b) => b.createdAt - a.createdAt);
  async function exportRecords() {
    const result = await request(`/projects/${projectId}/research/export`);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'research-records.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="panel-content research-panel">
      <div className="research-heading">
        <h2>{t('researchTitle')}</h2>
        <span>{t('local')}</span>
      </div>
      <p className="muted">{t('researchDescription')}</p>
      {!project ? (
        <p className="muted">{t('openProjectFirst')}</p>
      ) : (
        <>
          <div className="research-view-tabs">
            <button className={view === 'notes' ? 'active' : ''} onClick={() => setView('notes')}>
              {t('researchNotes')}
            </button>
            <button
              className={view === 'executions' ? 'active' : ''}
              onClick={() => setView('executions')}
            >
              {t('researchExecutions')}
            </button>
          </div>
          <div className="record-actions">
            <button
              onClick={() => {
                setView('notes');
                setDraft('new');
              }}
            >
              {t('researchAdd')}
            </button>
            <button onClick={() => void act(exportRecords)}>{t('researchExport')}</button>
          </div>
          {view === 'notes' ? (
            <>
              <form
                className="research-search"
                onSubmit={(event) => {
                  event.preventDefault();
                  setQuery(String(new FormData(event.currentTarget).get('query') || ''));
                }}
              >
                <input
                  name="query"
                  aria-label={t('researchSearch')}
                  placeholder={t('researchSearch')}
                />
                <button>{t('researchSearchAction')}</button>
              </form>
              {draft && (
                <ResearchEntryForm
                  key={draft === 'new' ? 'new' : draft.id}
                  entry={draft === 'new' ? undefined : draft}
                  entries={data.entries}
                  onSaved={() => setDraft(null)}
                />
              )}
              {loading ? (
                <p className="muted">{t('researchLoading')}</p>
              ) : (
                !data.entries.length && <p className="research-empty">{t('researchEmpty')}</p>
              )}
              {data.entries.map((entry) => (
                <ResearchEntryCard
                  entry={entry}
                  entries={data.entries}
                  key={entry.id}
                  onEdit={() => {
                    setDraft(entry);
                  }}
                />
              ))}
            </>
          ) : (
            <>
              <p className="muted">{t('researchExecutionHelp')}</p>
              {!executions.length && <p className="research-empty">{t('researchNoExecutions')}</p>}
              {executions.map((event) => (
                <details className="record" key={event.id}>
                  <summary>
                    <span className={`status ${event.phase}`}>
                      {t(`research.execution.${event.phase}`)}
                    </span>
                    <code>{event.jobId ? t('command') : event.tool}</code>
                  </summary>
                  <small>
                    {formatDate(event.createdAt)}
                    {event.durationMs !== undefined && ` · ${event.durationMs} ms`}
                  </small>
                  {event.exitCode !== undefined && (
                    <small>
                      {t('researchExitCode')}: {event.exitCode ?? '—'}
                    </small>
                  )}
                  <pre>
                    {JSON.stringify(
                      {
                        arguments: data.executions.find(
                          (start) => start.callId === event.callId && start.phase === 'started',
                        )?.arguments,
                        environment:
                          event.environment ||
                          data.executions.find(
                            (start) => start.callId === event.callId && start.phase === 'started',
                          )?.environment,
                        files: event.files,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}
