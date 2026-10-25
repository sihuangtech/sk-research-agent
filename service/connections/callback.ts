import { createServer } from 'node:http';
import { DomainError } from '../errors.js';

export async function listenForOAuth(state: string, signal: AbortSignal) {
  let accept!: (url: URL) => void;
  let reject!: (error: unknown) => void;
  let consumed = false;
  const result = new Promise<URL>((resolve, fail) => {
    accept = resolve;
    reject = fail;
  });
  // Attach a handler immediately; cancellation may happen before the caller awaits it.
  void result.catch(() => {});
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    if (
      request.method !== 'GET' ||
      url.pathname !== '/auth/callback' ||
      url.searchParams.get('state') !== state ||
      consumed
    ) {
      response.writeHead(400).end('Invalid or expired authorization callback.');
      return;
    }
    consumed = true;
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    url.host = `127.0.0.1:${port}`;
    response.end('Authorization received. Return to Second Moon to check the result.');
    accept(url);
  });
  await new Promise<void>((resolve, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new DomainError('authFailed');
  const close = () => {
    server.close();
    server.closeAllConnections();
  };
  const abort = () => {
    reject(new DomainError('authCancelled'));
    close();
  };
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  return {
    redirectUri: `http://127.0.0.1:${address.port}/auth/callback`,
    result,
    close: () => {
      signal.removeEventListener('abort', abort);
      close();
    },
  };
}
