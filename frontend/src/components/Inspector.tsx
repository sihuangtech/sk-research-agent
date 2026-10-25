import { BookOpen, Brain, Clock3, Folder, Terminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useWorkbench } from '../state/WorkbenchContext';
import AutomationsPanel from './AutomationsPanel';
import FilePanel from './FilePanel';
import JobsPanel from './JobsPanel';
import MemoryPanel from './MemoryPanel';
import ResearchPanel from './ResearchPanel';

export default function Inspector() {
  const { t } = useTranslation();

  const { panel, setPanel, project, revision, setError, requestedFile } = useWorkbench();
  return (
    <aside className="inspector">
      <div className="inspector-tabs">
        {(
          [
            ['files', Folder, t('files')],
            ['research', BookOpen, t('researchTab')],
            ['jobs', Terminal, t('jobs')],
            ['memory', Brain, t('memory')],
            ['automations', Clock3, t('automations')],
          ] as const
        ).map(([key, Icon, label]) => (
          <button className={panel === key ? 'active' : ''} onClick={() => setPanel(key)} key={key}>
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>
      {panel === 'files' && (
        <FilePanel
          key={`${project?.id}:${requestedFile}`}
          project={project}
          revision={revision}
          onError={setError}
          initialPath={requestedFile}
        />
      )}
      {panel === 'research' && <ResearchPanel key={project?.id} />}
      {panel === 'jobs' && <JobsPanel />}
      {panel === 'memory' && <MemoryPanel />}
      {panel === 'automations' && <AutomationsPanel />}
    </aside>
  );
}
