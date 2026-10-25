import ConversationView from './components/ConversationView';
import Inspector from './components/Inspector';
import ProjectDialog from './components/ProjectDialog';
import SettingsDialog from './components/settings/SettingsDialog';
import Sidebar from './components/Sidebar';
import { useWorkbench, WorkbenchProvider } from './state/WorkbenchContext';

function Workbench() {
  const { settings, setSettings, data, refresh, addingProject } = useWorkbench();
  return (
    <div className="workbench">
      <Sidebar />
      <ConversationView />
      <Inspector />
      {settings && (
        <SettingsDialog
          providers={data.providers}
          onClose={() => setSettings(false)}
          onSaved={refresh}
        />
      )}
      {addingProject && <ProjectDialog />}
    </div>
  );
}
export default function App() {
  return (
    <WorkbenchProvider>
      <Workbench />
    </WorkbenchProvider>
  );
}
