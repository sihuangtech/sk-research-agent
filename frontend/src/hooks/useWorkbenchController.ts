import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  ChangeNotice,
  Conversation,
  Overview,
  Project,
  SessionSnapshot,
} from '../../../shared/contracts';
import { mergeSnapshot, snapshotQuery } from '../../../shared/snapshot';
import { request, watchChanges } from '../api';
import { preferredConnection } from '../preferences';
import { type PendingRefresh, queueRefresh, sessionNotice } from '../state/changes';
import { useAlerts } from './useAlerts';

const empty: Overview = {
  projects: [],
  sessions: [],
  providers: [],
  memories: [],
  automations: [],
};

export function useWorkbenchController() {
  const { t, i18n } = useTranslation();

  const [data, setData] = useState<Overview>(empty);
  const [projectId, setProjectId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [snapshot, setSnapshotState] = useState<SessionSnapshot | null>(null);
  // Base for partial snapshot requests; always the snapshot that is on screen.
  const shown = useRef<SessionSnapshot | null>(null);
  const setSnapshot = useCallback((value: SessionSnapshot | null) => {
    shown.current = value;
    setSnapshotState(value);
  }, []);
  const [providerId, setProviderId] = useState('');
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'steer' | 'followUp'>('steer');
  const [panel, setPanel] = useState<
    'files' | 'research' | 'jobs' | 'memory' | 'automations' | 'safeguards'
  >('files');
  const [requestedFile, setRequestedFile] = useState('');
  useEffect(() => setRequestedFile(''), [projectId]);
  const [settings, setSettings] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const [error, setError] = useState<unknown>('');
  const [online, setOnline] = useState(false);
  const [sending, setSending] = useState(false);
  const [filesRevision, setFilesRevision] = useState(0);
  const [researchRevision, setResearchRevision] = useState(0);
  const [jobsRevision, setJobsRevision] = useState(0);
  const chatEnd = useRef<HTMLDivElement>(null);
  const selection = useRef({ projectId, sessionId });
  selection.current = { projectId, sessionId };
  const openSession = useCallback(() => selection.current.sessionId, []);
  const { alerts, pushAlerts, dismissAlert, describeAlert, settleApprovals } =
    useAlerts(openSession);
  const loading = useRef(false);
  const queued = useRef<PendingRefresh | null>(null);
  const loadSnapshot = useCallback(
    async (selected: string, full: boolean) => {
      const base = full ? null : shown.current;
      const next = await request<SessionSnapshot>(
        `/sessions/${selected}${snapshotQuery(base, selected)}`,
      );
      const merged =
        mergeSnapshot(base, next) || (await request<SessionSnapshot>(`/sessions/${selected}`));
      if (selection.current.sessionId !== selected) return;
      setSnapshot(merged);
      if (!merged.approvals?.length) settleApprovals(selected);
    },
    [setSnapshot, settleApprovals],
  );
  // Loads only the areas named by change notices; `null` reloads everything.
  const sync = useCallback(
    async (notice: ChangeNotice | null) => {
      if (notice?.alerts?.length) pushAlerts(notice.alerts);
      queued.current = queueRefresh(queued.current, notice);
      if (loading.current) return;
      loading.current = true;
      try {
        while (queued.current) {
          const work = queued.current;
          queued.current = null;
          const { projectId: current, sessionId: selected } = selection.current;
          if (work.full || work.overview) setData(await request<Overview>('/overview'));
          if (selected && (work.full || work.sessions.has(selected)))
            await loadSnapshot(selected, work.full);
          if (work.full || work.files.has(current)) setFilesRevision((v) => v + 1);
          if (work.full || work.research.has(current)) setResearchRevision((v) => v + 1);
          if (work.full || work.jobs.has(current)) setJobsRevision((v) => v + 1);
        }
      } catch (e) {
        setError(e);
      } finally {
        loading.current = false;
      }
    },
    [loadSnapshot, pushAlerts],
  );
  const refresh = useCallback(() => sync(null), [sync]);
  useEffect(() => {
    void refresh();
  }, [i18n.resolvedLanguage, refresh]);
  useEffect(() => {
    const controller = new AbortController();
    void watchChanges(
      controller.signal,
      (notice) => {
        void sync(notice);
      },
      setOnline,
    );
    return () => controller.abort();
  }, [sync]);
  useEffect(() => {
    if (!projectId && data.projects.length) setProjectId(data.projects[0].id);
    if (!data.providers.some((p) => p.id === providerId))
      setProviderId(
        data.providers.find((p) => p.id === preferredConnection())?.id ||
          data.providers[0]?.id ||
          '',
      );
  }, [data, projectId, providerId]);
  useEffect(() => {
    const update = () => {
      const preferred = preferredConnection();
      if (preferred) setProviderId(preferred);
    };
    window.addEventListener('second-moon-preferences', update);
    return () => window.removeEventListener('second-moon-preferences', update);
  }, []);
  useEffect(() => {
    setSnapshot(null);
    if (sessionId) void sync(sessionNotice(sessionId));
  }, [sessionId, setSnapshot, sync]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [snapshot?.messages.length, snapshot?.activeTools.length]);
  const project = data.projects.find((p) => p.id === projectId);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setSessionId('');
        setSnapshot(null);
      }
      if (event.key === 'Escape') {
        setSettings(false);
        setAddingProject(false);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
  const sessions = data.sessions.filter((s) => s.projectId === projectId);
  const running = snapshot?.conversation.status === 'running';
  const act = async (action: () => Promise<unknown>) => {
    setError('');
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(e);
    }
  };
  async function addProject(path: string) {
    const p = await request<Project>('/projects', 'POST', { path });
    setProjectId(p.id);
    setSessionId('');
    setAddingProject(false);
  }
  async function chooseProject() {
    if (isTauri()) {
      await act(async () => {
        const path = await open({ directory: true, multiple: false, title: t('chooseFolder') });
        if (path) await addProject(path);
      });
    } else setAddingProject(true);
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || sending || !projectId || !providerId) return;
    setSending(true);
    const message = text;
    await act(async () => {
      let target = sessionId;
      if (!target) {
        const s = await request<Conversation>('/sessions', 'POST', { projectId, providerId });
        target = s.id;
        selection.current.sessionId = target;
        setSessionId(target);
      }
      await request(`/sessions/${target}/messages`, 'POST', {
        text: message,
        mode: running ? mode : 'prompt',
      });
      setText('');
    });
    setSending(false);
  }

  return {
    data,
    projectId,
    setProjectId,
    sessionId,
    setSessionId,
    snapshot,
    setSnapshot,
    providerId,
    setProviderId,
    text,
    setText,
    mode,
    setMode,
    panel,
    setPanel,
    requestedFile,
    setRequestedFile,
    settings,
    setSettings,
    addingProject,
    setAddingProject,
    error,
    setError,
    online,
    sending,
    filesRevision,
    researchRevision,
    jobsRevision,
    alerts,
    dismissAlert,
    describeAlert,
    chatEnd,
    refresh,
    project,
    sessions,
    running,
    act,
    addProject,
    chooseProject,
    send,
  };
}
