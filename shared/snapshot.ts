import type { SessionSnapshot } from './contracts.js';

/**
 * Query for the next snapshot. Every message except the last one is final, so the client
 * only asks for the last message onward and names the message before it as the anchor.
 */
export function snapshotQuery(base: SessionSnapshot | null, sessionId: string) {
  if (!base || base.conversation.id !== sessionId || base.messages.length < 2) return '';
  const after = base.messages.length - 1;
  const anchor = base.messages[after - 1].key;
  return `?after=${after}&anchor=${encodeURIComponent(anchor)}`;
}
/** Applies a partial snapshot to the base it was requested from. */
export function mergeSnapshot(base: SessionSnapshot | null, next: SessionSnapshot) {
  if (!next.from) return next;
  if (!base || base.conversation.id !== next.conversation.id || base.messages.length < next.from)
    return null;
  return { ...next, from: 0, messages: [...base.messages.slice(0, next.from), ...next.messages] };
}
