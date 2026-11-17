/**
 * Tool access for one agent turn.
 * - `full`: files, commands and experiments (risky actions still need approval).
 * - `review`: read, search and record only. Used for follow-ups and daily briefs.
 * - `report`: `review` plus saving one report under `reports/`.
 */
export type ToolProfile = 'full' | 'review' | 'report';

export type ApprovalReason = 'destructive' | 'environment' | 'network' | 'protected' | 'privilege';
export interface Approval {
  id: string;
  sessionId: string;
  projectId: string;
  tool: string;
  /** The command or path, shown verbatim so the researcher sees exactly what would run. */
  action: string;
  reason: ApprovalReason;
  createdAt: number;
}
export type AlertKind =
  | 'turnFinished'
  | 'turnFailed'
  | 'jobFinished'
  | 'jobFailed'
  | 'approvalNeeded'
  | 'memoryProposed';
export interface Alert {
  kind: AlertKind;
  projectId: string;
  sessionId?: string;
  /** Session title, job command or memory text. User content, never translated. */
  subject: string;
}
export interface Checkpoint {
  id: string;
  projectId: string;
  sessionId: string | null;
  /** The request that started the turn, or the reason for a manual checkpoint. */
  label: string;
  commit: string;
  createdAt: number;
  files: number;
  /** Files left out because they were too large or protected. */
  skipped: number;
}
export type ReportKind = 'weekly' | 'groupMeeting';
