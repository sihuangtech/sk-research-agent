export type ApiMode =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages'
  | 'google-generative-ai'
  | 'mistral-conversations';
export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  api: ApiMode;
  model: string;
  contextWindow: number;
  maxTokens: number;
  hasKey: boolean;
  presetId?: string;
  authMethod?: import('./providers.js').AuthMethod;
  billing?: import('./providers.js').BillingMode;
  reasoning?: boolean;
  vision?: boolean;
  accountLabel?: string;
}
export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: number;
}
export interface Conversation {
  id: string;
  projectId: string;
  providerId: string;
  title: string;
  sessionFile: string;
  createdAt: number;
  updatedAt: number;
  status: 'idle' | 'running' | 'interrupted' | 'error';
  error?: string;
  errorCode?: string;
}
export interface Memory {
  id: string;
  projectId: string | null;
  content: string;
  source: string;
  updatedAt: number;
}
export interface Job {
  id: string;
  projectId: string;
  sessionId: string | null;
  command: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  createdAt: number;
  endedAt?: number;
  exitCode?: number | null;
  log: string;
  noticeCode?: string;
}
export interface Automation {
  id: string;
  projectId: string;
  providerId: string;
  name: string;
  prompt: string;
  intervalMinutes: number;
  nextRunAt: number;
  enabled: boolean;
  lastSessionId?: string;
  locale?: import('./locale.js').Locale;
}
export interface ChatMessage {
  role: string;
  text: string;
  toolName?: string;
  isError?: boolean;
}
export interface SessionSnapshot {
  conversation: Conversation;
  messages: ChatMessage[];
  activeTools: string[];
  queued: string[];
}
export interface Overview {
  projects: Project[];
  sessions: Conversation[];
  providers: Provider[];
  memories: Memory[];
  jobs: Job[];
  automations: Automation[];
}
export interface FileEntry {
  name: string;
  path: string;
  directory: boolean;
  size: number;
}
