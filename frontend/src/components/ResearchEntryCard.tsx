import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResearchEntry, ResearchSource } from '../../../shared/research';
import { request } from '../api';
import { formatDate } from '../i18n';
import { useWorkbench } from '../state/WorkbenchContext';

type CheckedSource = ResearchSource & {
  state: 'unchanged' | 'changed' | 'unavailable' | 'reference-only';
};
export default function ResearchEntryCard({
  entry,
  entries,
  onEdit,
}: {
  entry: ResearchEntry;
  entries: ResearchEntry[];
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const { setSessionId, setRequestedFile, setPanel, act } = useWorkbench();
  const [checked, setChecked] = useState<CheckedSource[]>([]);
  const [checking, setChecking] = useState(false);
  return (
    <article className="record research-entry">
      <div className="research-entry-meta">
        <span>{t(`research.kind.${entry.kind}`)}</span>
        <span>{t(`research.state.${entry.status}`)}</span>
      </div>
      <h3>{entry.title}</h3>
      <small>
        {formatDate(entry.createdAt)} ·{' '}
        {t(entry.author === 'user' ? 'researchUser' : 'researchAgent')}
      </small>
      {entry.author === 'agent' && <p className="research-unreviewed">{t('researchUnreviewed')}</p>}
      <p className="research-note-text">{entry.content}</p>
      {entry.sources.map((source, index) => (
        <div className="research-source" key={`${source.path || source.url}:${index}`}>
          <small>
            {t(source.role === 'artifact' ? 'researchArtifact' : 'researchSource')} ·{' '}
            {t(`research.verification.${source.verification}`)}
          </small>
          {source.path && (
            <button
              className="research-file-link"
              onClick={() => {
                setRequestedFile(source.path!);
                setPanel('files');
              }}
            >
              {source.path}
              {source.page && ` · p. ${source.page}`}
            </button>
          )}
          {source.url && (
            <a href={source.url} target="_blank" rel="noreferrer">
              {source.url}
            </a>
          )}
          {source.quote && <blockquote>{source.quote}</blockquote>}
          {source.sha256 && (
            <details>
              <summary>SHA-256</summary>
              <code>{source.sha256}</code>
            </details>
          )}
          {checked[index] && (
            <strong className={`research-source-state ${checked[index].state}`}>
              {t(`research.check.${checked[index].state}`)}
            </strong>
          )}
        </div>
      ))}
      {entry.relatedIds.length > 0 && (
        <small>
          {t('researchRelated')}:{' '}
          {entry.relatedIds
            .map((id) => entries.find((value) => value.id === id)?.title || id)
            .join(' · ')}
        </small>
      )}
      {entry.supersedesId && <small>{t('researchRevision')}</small>}
      <div className="record-actions">
        <button onClick={onEdit}>{t('researchRevise')}</button>
        {entry.sessionId && (
          <button onClick={() => setSessionId(entry.sessionId!)}>{t('researchOpenSession')}</button>
        )}
        {entry.sources.length > 0 && (
          <button
            disabled={checking}
            onClick={() => {
              setChecking(true);
              void act(async () =>
                setChecked(await request<CheckedSource[]>(`/research/${entry.id}/sources`)),
              ).finally(() => setChecking(false));
            }}
          >
            {t('researchCheckSources')}
          </button>
        )}
      </div>
    </article>
  );
}
