import { useTranslation } from 'react-i18next';
import type { Conversation } from '../../../shared/contracts';
import { request } from '../api';
import { useWorkbench } from '../state/WorkbenchContext';

const ranges = [7, 14, 30];

/** Starts a session that writes a weekly report or group meeting outline from research records. */
export default function ReportComposer() {
  const { t } = useTranslation('partner');
  const { projectId, providerId, act, setSessionId } = useWorkbench();
  return (
    <details className="record report-composer">
      <summary>{t('reportTitle')}</summary>
      <p className="muted">{t('reportDescription')}</p>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void act(async () => {
            const session = await request<Conversation>(`/projects/${projectId}/reports`, 'POST', {
              providerId,
              kind: form.get('kind'),
              days: Number(form.get('days')),
            });
            setSessionId(session.id);
          });
        }}
      >
        <select name="kind" aria-label={t('reportTitle')}>
          <option value="weekly">{t('reportWeekly')}</option>
          <option value="groupMeeting">{t('reportGroupMeeting')}</option>
        </select>
        <select name="days" aria-label={t('reportDays', { days: 7 })} defaultValue="7">
          {ranges.map((days) => (
            <option key={days} value={days}>
              {t('reportDays', { days })}
            </option>
          ))}
        </select>
        <button className="primary" disabled={!providerId}>
          {t('reportGenerate')}
        </button>
      </form>
    </details>
  );
}
