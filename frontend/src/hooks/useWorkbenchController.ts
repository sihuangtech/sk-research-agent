import { isTauri } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Conversation, Overview, Project, SessionSnapshot } from '../../../shared/contracts';
import { request, watchChanges } from '../api';
import { preferredConnection } from '../preferences';

const empty: Overview = {
  projects: [],
  sessions: [],
  providers: [],
  memories: [],
  jobs: [],
  automations: [],
};

export function useWorkbenchController() {
  const { t, i18n } = useTranslation();

  const [data, setData] = useState<Overview>(empty);
  const [projectId, setProjectId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [providerId, setProviderId] = useState('');
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'steer' | 'followUp'>('steer');
  const [panel, setPanel] = useState<'files' | 'research' | 'jobs' | 'memory' | 'automations'>(
    'files',
  );
  const [requestedFile, setRequestedFile] = useState('');
  useEffect(() => setRequestedFile(''), [projectId]);
  const [settings, setSettings] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const [error, setError] = useState<unknown>('');
  const [online, setOnline] = useState(false);
  const [sending, setSending] = useState(false);
  const [revision, setRevision] = useState(0);
  const chatEnd = useRef<HTMLDivElement>(null);
  const selection = useRef({ projectId, sessionId });
  selection.current = { projectId, sessionId };
  const loading = useRef(false);
  const pending = useRef(false);
  const refresh = useCallback(async () => {
    if (loading.current) {
      pending.current = true;
      return;
    }
    loading.current = true;
    try {
      do {
        pending.current = false;
        const next = await request<Overview>('/overview');
        setData(next);
        const selected = selection.current.sessionId;
        if (selected) {
          const s = await request<SessionSnapshot>(`/sessions/${selected}`);
          if (selection.current.sessionId === selected) setSnapshot(s);
        }
        setRevision((v) => v + 1);
      } while (pending.current);
    } catch (e) {
      setError(e);
    } finally {
      loading.current = false;
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [i18n.resolvedLanguage, refresh]);
  useEffect(() => {
    const controller = new AbortController();
    void watchChanges(
      controller.signal,
      () => {
        void refresh();
      },
      setOnline,
    );
    return () => controller.abort();
  }, [refresh]);
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
    if (sessionId) void refresh();
  }, [sessionId, refresh]);
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
    revision,
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
