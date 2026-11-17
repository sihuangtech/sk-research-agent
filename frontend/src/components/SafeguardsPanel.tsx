import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Checkpoint } from '../../../shared/partner';
import { request } from '../api';
import { formatDate } from '../i18n';
import { useWorkbench } from '../state/WorkbenchContext';

/** Read-only paths for the agent, and checkpoints to put project files back. */
export default function SafeguardsPanel() {
  const { t } = useTranslation('partner');
  const { project, projectId, act, filesRevision, setError } = useWorkbench();
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [available, setAvailable] = useState(true);
  const protectedPaths = project?.protectedPaths || [];
  useEffect(() => setCheckpoints([]), [projectId]);
  // Checkpoints change when a turn starts or files are restored, which both notify files.
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    void request<{ available: boolean; checkpoints: Checkpoint[] }>(
      `/projects/${projectId}/checkpoints`,
      'GET',
      undefined,
      controller.signal,
    )
      .then((result) => {
        setAvailable(result.available);
        setCheckpoints(result.checkpoints);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error);
      });
    return () => controller.abort();
  }, [projectId, filesRevision, setError]);
  const saveProtected = (paths: string[]) =>
    act(() => request(`/projects/${projectId}/protected`, 'PUT', { paths }));
  if (!project) return null;
  return (
    <section className="panel-content safeguards-panel">
      <h2>{t('safeguardsTitle')}</h2>
      <p className="muted">{t('safeguardsDescription')}</p>
      <h3>{t('protectedTitle')}</h3>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const path = String(new FormData(form).get('path') || '').trim();
          if (!path) return;
          void saveProtected([...protectedPaths, path]).then(() => form.reset());
        }}
      >
        <input
          name="path"
          aria-label={t('protectedPlaceholder')}
          placeholder={t('protectedPlaceholder')}
        />
        <button className="primary">{t('protect')}</button>
      </form>
      {!protectedPaths.length && <p className="muted">{t('protectedEmpty')}</p>}
      {protectedPaths.map((path) => (
        <div className="record protected-path" key={path}>
          <code>{path}</code>
          <button
            className="text-button"
            onClick={() => void saveProtected(protectedPaths.filter((p) => p !== path))}
          >
            {t('unprotect')}
          </button>
        </div>
      ))}
      <div className="safeguards-heading">
        <h3>{t('checkpointsTitle')}</h3>
        <button
          disabled={!available}
          onClick={() =>
            void act(() =>
              request(`/projects/${projectId}/checkpoints`, 'POST', {
                label: t('checkpointManual'),
              }),
            )
          }
        >
          {t('checkpointNow')}
        </button>
      </div>
      <p className="muted">
        {available ? t('checkpointSkippedHelp') : t('checkpointsUnavailable')}
      </p>
      {available && !checkpoints.length && <p className="muted">{t('checkpointsEmpty')}</p>}
      {checkpoints.map((checkpoint) => (
        <div className="record" key={checkpoint.id}>
          <strong className="checkpoint-label">{checkpoint.label}</strong>
          <small>
            {t('checkpointMeta', {
              date: formatDate(checkpoint.createdAt),
              files: checkpoint.files,
              skipped: checkpoint.skipped,
            })}
          </small>
          <div className="record-actions">
            <button
              onClick={() => {
                if (window.confirm(t('restoreConfirm', { label: checkpoint.label })))
                  void act(() => request(`/checkpoints/${checkpoint.id}/restore`, 'POST'));
              }}
            >
              {t('restore')}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
