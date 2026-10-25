import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createModelRuntime } from '../connections/runtime.js';
import { fixture } from './helpers.js';

test('ChatGPT transport uses the public subscription route and rejects truncated streams', async () => {
  const f = await fixture();
  try {
    const p = await f.call('/providers', 'POST', {
      name: 'Stream fixture',
      presetId: 'chatgpt',
      model: 'gpt-6.1-sol',
    });
    await f.secrets.set(
      p.id,
      JSON.stringify({
        type: 'oauth',
        access: 'fixture-subscription-token',
        refresh: 'fixture-refresh',
        expires: Date.now() + 3600000,
        clientId: 'oaiapp_test',
        subject: 'fixture-user',
      }),
    );
    const { runtime, model } = await createModelRuntime(p, f.secrets);
    for (const completed of [true, false]) {
      let requests = 0;
      const response = await runtime.completeSimple(
        model,
        {
          systemPrompt: 'Research responsibly.',
          messages: [{ role: 'user', content: 'Hello', timestamp: Date.now() }],
        },
        {
          maxTokens: 32,
          maxRetries: 0,
          fetch: async (input, init) => {
            const request = new Request(input, init);
            requests++;
            assert.equal(request.url, 'https://api.openai.com/v1/responses');
            assert.equal(request.headers.get('authorization'), 'Bearer fixture-subscription-token');
            const body = await request.json();
            assert.equal(body.store, false);
            assert.equal(body.stream, true);
            assert.equal(body.max_output_tokens, undefined);
            assert.equal(body.input[0].role, 'developer');
            const events = [{ type: 'response.created', response: { id: 'response_test' } }];
            if (completed)
              events.push({
                type: 'response.completed',
                response: { id: 'response_test', status: 'completed', output: [] } as {
                  id: string;
                },
              });
            return new Response(
              events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
              {
                headers: { 'Content-Type': 'text/event-stream' },
              },
            );
          },
        },
      );
      assert.equal(requests, 1);
      assert.equal(response.stopReason, completed ? 'stop' : 'error');
      if (!completed) assert.match(response.errorMessage || '', /terminal response event/);
    }
  } finally {
    await f.close();
  }
});
