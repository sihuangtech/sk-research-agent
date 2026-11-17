import assert from 'node:assert/strict';
import { createServer } from 'node:http';

export type Step = { tool: string; args: Record<string, unknown> } | { text: string };

/**
 * OpenAI-compatible model that plays a script. The step is chosen by how many tool results the
 * request already contains, so each turn starts again from step 0 after its own tool results.
 */
export async function scriptedModel(script: (toolResults: number, request: any) => Step) {
  const requests: any[] = [];
  const server = createServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const payload = JSON.parse(raw);
    requests.push(payload);
    const last = payload.messages.map((m: any) => m.role).lastIndexOf('user');
    const toolResults = payload.messages.slice(last).filter((m: any) => m.role === 'tool').length;
    const step = script(toolResults, payload);
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = (delta: unknown, finish: string | null = null) =>
      response.write(
        `data: ${JSON.stringify({ id: 'scripted', object: 'chat.completion.chunk', created: 1, model: 'scripted', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`,
      );
    if ('tool' in step) {
      const call = {
        index: 0,
        id: `call_${requests.length}`,
        type: 'function',
        function: { name: step.tool, arguments: JSON.stringify(step.args) },
      };
      send({ role: 'assistant', tool_calls: [call] });
      send({}, 'tool_calls');
    } else {
      send({ role: 'assistant', content: step.text });
      send({}, 'stop');
    }
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    requests,
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    toolNames: (index: number) =>
      (requests[index]?.tools || []).map((t: any) => t.function.name as string),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
