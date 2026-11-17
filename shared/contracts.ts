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
  /** Position and identity in the model history; stable once the message has ended. */
  key: string;
  role: string;
  text: string;
  toolName?: string;
  isError?: boolean;
}
export interface SessionSnapshot {
  conversation: Conversation;
  /** Index of the first returned message. Earlier messages are unchanged on the client. */
  from: number;
  messages: ChatMessage[];
  activeTools: string[];
  queued: string[];
}
/** Projects, sessions and settings. Job logs are loaded per project by the jobs panel. */
export interface Overview {
  projects: Project[];
  sessions: Conversation[];
  providers: Provider[];
  memories: Memory[];
  automations: Automation[];
}
/** Areas changed since the previous event. Project areas list project IDs. */
export interface ChangeNotice {
  overview: boolean;
  sessions: string[];
  files: string[];
  research: string[];
  jobs: string[];
}
export interface FileEntry {
  name: string;
  path: string;
  directory: boolean;
  size: number;
}
