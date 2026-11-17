import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { request } from '../api';
import { useWorkbench } from '../state/WorkbenchContext';

/** Risky actions the agent is waiting on. The exact command is shown, never a paraphrase. */
export default function ApprovalCards() {
  const { t } = useTranslation('partner');
  const { snapshot, act } = useWorkbench();
  if (!snapshot?.approvals?.length) return null;
  return (
    <>
      {snapshot.approvals.map((approval) => (
        <section className="approval-card" key={approval.id} aria-live="polite">
          <header>
            <ShieldAlert size={15} />
            <strong>{t('approvalTitle')}</strong>
            <span>{t(`approval.${approval.reason}`)}</span>
          </header>
          <code>
            {approval.tool}: {approval.action}
          </code>
          <div className="record-actions">
            <button
              className="primary"
              onClick={() =>
                void act(() => request(`/approvals/${approval.id}`, 'POST', { approved: true }))
              }
            >
              {t('approve')}
            </button>
            <button
              onClick={() =>
                void act(() => request(`/approvals/${approval.id}`, 'POST', { approved: false }))
              }
            >
              {t('deny')}
            </button>
          </div>
        </section>
      ))}
    </>
  );
}
