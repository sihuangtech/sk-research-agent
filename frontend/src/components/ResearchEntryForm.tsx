import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { researchKinds, researchStates, type ResearchEntry } from '../../../shared/research';
import { request } from '../api';
import { useWorkbench } from '../state/WorkbenchContext';

export default function ResearchEntryForm({
  entry,
  entries,
  onSaved,
}: {
  entry?: ResearchEntry;
  entries: ResearchEntry[];
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { projectId, sessionId, act } = useWorkbench();
  const [busy, setBusy] = useState(false);
  const primary = entry?.sources.find((source) => source.role === 'source');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true);
    await act(async () => {
      const path = String(values.get('path') || '').trim();
      const url = String(values.get('url') || '').trim();
      const quote = String(values.get('quote') || '').trim();
      const page = Number(values.get('page')) || undefined;
      const related = String(values.get('related') || '');
      const sources = [
        ...(path || url
          ? [
              {
                path: path || undefined,
                url: url || undefined,
                quote: quote || undefined,
                page,
                role: 'source',
              },
            ]
          : []),
        ...(entry?.sources.filter((source) => source.role === 'source').slice(1) || []),
        ...String(values.get('artifacts') || '')
          .split('\n')
          .map((value) => value.trim())
          .filter(Boolean)
          .map((path) => ({ path, role: 'artifact' })),
      ];
      await request(`/projects/${projectId}/research`, 'POST', {
        kind: values.get('kind'),
        status: values.get('status'),
        title: values.get('title'),
        content: values.get('content'),
        sessionId: entry?.sessionId ?? (sessionId || null),
        relatedIds: [...new Set([...(entry?.relatedIds || []), ...(related ? [related] : [])])],
        supersedesId: entry?.id,
        sources,
      });
      form.reset();
      onSaved();
    });
    setBusy(false);
  }
  return (
    <form className="research-form" onSubmit={(event) => void save(event)}>
      <div className="two-columns">
        <label>
          {t('researchKind')}
          <select name="kind" defaultValue={entry?.kind || 'question'}>
            {researchKinds.map((kind) => (
              <option key={kind} value={kind}>
                {t(`research.kind.${kind}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('researchState')}
          <select name="status" defaultValue={entry?.status || 'open'}>
            {researchStates.map((state) => (
              <option key={state} value={state}>
                {t(`research.state.${state}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        {t('researchEntryTitle')}
        <input name="title" defaultValue={entry?.title} required maxLength={200} />
      </label>
      <label>
        {t('researchContent')}
        <textarea
          name="content"
          defaultValue={entry?.content}
          required
          maxLength={12000}
          rows={5}
        />
      </label>
      <details>
        <summary>{t('researchSources')}</summary>
        <div className="research-source-fields">
          <label>
            {t('researchSourcePath')}
            <input name="path" defaultValue={primary?.path} />
          </label>
          <label>
            {t('researchSourceUrl')}
            <input name="url" type="url" defaultValue={primary?.url} />
          </label>
          <label>
            {t('researchSourcePage')}
            <input name="page" type="number" min={1} defaultValue={primary?.page} />
          </label>
          <label>
            {t('researchQuote')}
            <textarea name="quote" defaultValue={primary?.quote} maxLength={8000} />
          </label>
          <label>
            {t('researchArtifacts')}
            <textarea
              name="artifacts"
              defaultValue={entry?.sources
                .filter((source) => source.role === 'artifact')
                .map((source) => source.path)
                .join('\n')}
            />
          </label>
          <label>
            {t('researchRelated')}
            <select name="related" defaultValue="">
              <option value="">{t('researchNoRelation')}</option>
              {entries
                .filter((value) => value.id !== entry?.id)
                .map((value) => (
                  <option value={value.id} key={value.id}>
                    {value.title}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </details>
      <p className="muted">{t('researchSourceHelp')}</p>
      <button className="primary" disabled={busy}>
        {t('save')}
      </button>
      <button type="button" onClick={onSaved}>
        {t('researchCancel')}
      </button>
    </form>
  );
}
