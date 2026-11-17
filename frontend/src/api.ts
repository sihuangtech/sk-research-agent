import { invoke, isTauri } from '@tauri-apps/api/core';
import type { ChangeNotice } from '../../shared/contracts';
import { currentLocale, i18n, serviceMessage, syncDesktopLanguage, UiMessage } from './i18n';
import { parseNotice } from './state/changes';

export class RequestError extends Error {
  constructor(
    readonly code: string | undefined,
    details: string,
  ) {
    super(details);
  }
  toString() {
    return serviceMessage(this.code, this.message);
  }
}
async function checkedFetch(url: string, options: RequestInit) {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new UiMessage('networkError');
  }
}
async function responseError(response: Response): Promise<never> {
  const body = await response.json().catch(() => null);
  const issues = body?.issues
    ?.map((issue: { path: string; message: string }) => `${issue.path}: ${issue.message}`)
    .join('\n');
  throw new RequestError(
    issues ? undefined : body?.code,
    issues || body?.error || `HTTP ${response.status}`,
  );
}
const headers = () => ({ Authorization: `Bearer ${token}`, 'Accept-Language': currentLocale() });

let base = '';
let token = import.meta.env.VITE_AGENTIC_TOKEN || '';
export async function initializeApi() {
  if (isTauri()) {
    await syncDesktopLanguage();
    const connection = await invoke<{ baseUrl: string; token: string }>('backend_connection');
    base = connection.baseUrl;
    token = connection.token;
  }
}
export async function request<T>(
  path: string,
  method = 'GET',
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await checkedFetch(`${base}/api${path}`, {
    method,
    signal,
    headers: {
      ...headers(),
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!response.ok) {
    await responseError(response);
  }
  return response.json() as Promise<T>;
}
export async function fileBlob(projectId: string, path: string) {
  const response = await checkedFetch(
    `${base}/api/projects/${projectId}/file?raw=1&path=${encodeURIComponent(path)}`,
    { headers: headers() },
  );
  if (!response.ok) await responseError(response);
  return response.blob();
}
/** Reports each change notice; `null` (on every connection) means reload everything. */
export async function watchChanges(
  signal: AbortSignal,
  changed: (notice: ChangeNotice | null) => void,
  connection: (online: boolean) => void,
) {
  while (!signal.aborted) {
    try {
      const response = await fetch(`${base}/api/events`, {
        signal,
        headers: headers(),
      });
      if (!response.ok || !response.body) throw new Error(i18n.t('connectionFailed'));
      connection(true);
      changed(null);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      while (!signal.aborted) {
        const chunk = await reader.read();
        if (chunk.done) break;
        pending += decoder.decode(chunk.value, { stream: true });
        const blocks = pending.split('\n\n');
        pending = blocks.pop() || '';
        for (const block of blocks)
          if (block.startsWith('data:')) changed(parseNotice(block.slice(5)));
      }
    } catch {
      if (signal.aborted) return;
    }
    connection(false);
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, 1500);
      signal.addEventListener('abort', done, { once: true });
      if (signal.aborted) done();
    });
  }
}
