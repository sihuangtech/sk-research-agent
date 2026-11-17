import type { EventEmitter } from 'node:events';
import type { FastifyInstance } from 'fastify';
import type { ChangeNotice } from '../../shared/contracts.js';
export function registerEvents(app: FastifyInstance, events: EventEmitter) {
  app.get('/api/events', async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...(request.headers.origin ? { 'Access-Control-Allow-Origin': request.headers.origin } : {}),
    });
    const emit = (notice: ChangeNotice) => {
      if (!reply.raw.destroyed) reply.raw.write(`data: ${JSON.stringify(notice)}\n\n`);
    };
    // Flush headers. The client loads everything itself after each connection.
    reply.raw.write(': connected\n\n');
    events.on('change', emit);
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) reply.raw.write(': heartbeat\n\n');
    }, 15000);
    const finish = () => reply.raw.end();
    events.on('shutdown', finish);
    reply.raw.on('close', () => {
      clearInterval(heartbeat);
      events.off('change', emit);
      events.off('shutdown', finish);
    });
  });
}
