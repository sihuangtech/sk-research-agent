export const researchKinds = [
  'question',
  'hypothesis',
  'evidence',
  'experiment',
  'decision',
  'next_step',
  'handoff',
] as const;
export const researchStates = [
  'open',
  'supported',
  'challenged',
  'inconclusive',
  'completed',
] as const;
export type ResearchKind = (typeof researchKinds)[number];
export type ResearchState = (typeof researchStates)[number];

export interface ResearchSource {
  path?: string;
  url?: string;
  page?: number;
  quote?: string;
  sha256?: string;
  bytes?: number;
  capturedAt?: number;
  role: 'source' | 'artifact';
  verification: 'excerpt-matched' | 'file-snapshot' | 'reference-only';
}
export interface ResearchEntry {
  id: string;
  projectId: string;
  sessionId: string | null;
  kind: ResearchKind;
  status: ResearchState;
  title: string;
  content: string;
  author: 'user' | 'agent';
  createdAt: number;
  relatedIds: string[];
  supersedesId?: string;
  sources: ResearchSource[];
}
export interface ExecutionEvent {
  id: string;
  projectId: string;
  sessionId: string | null;
  callId: string;
  jobId?: string;
  tool: string;
  phase: 'started' | 'completed' | 'failed' | 'interrupted';
  createdAt: number;
  arguments?: Record<string, unknown>;
  durationMs?: number;
  exitCode?: number | null;
  files?: ResearchSource[];
  environment?: { platform: string; arch: string; node: string; cwd: string };
}
export interface ResearchOverview {
  entries: ResearchEntry[];
  executions: ExecutionEvent[];
}
