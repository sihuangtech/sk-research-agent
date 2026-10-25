// SIWC's public Responses route has a narrower contract than Platform API keys.
// Keep this boundary explicit even when the SDK's defaults change.
export function chatGPTPayload(value: unknown) {
  const body = { ...(value as Record<string, unknown>) };
  for (const key of [
    'background',
    'conversation',
    'max_output_tokens',
    'max_tool_calls',
    'metadata',
    'moderation',
    'multi_agent',
    'prompt',
    'prompt_cache_retention',
    'prompt_cache_options',
    'safety_identifier',
    'temperature',
    'top_logprobs',
    'top_p',
    'truncation',
    'user',
    'previous_response_id',
  ])
    delete body[key];
  body.store = false;
  body.stream = true;
  if (Array.isArray(body.input))
    body.input = body.input.map((item) =>
      item.role === 'system' ? { ...item, role: 'developer' } : item,
    );
  if (Array.isArray(body.tools)) {
    const functions = body.tools.filter((tool) => ['function', 'custom'].includes(tool.type));
    const others = body.tools.filter((tool) => !['function', 'custom'].includes(tool.type));
    body.tools = functions.length
      ? [
          {
            type: 'namespace',
            name: 'research',
            description: 'Local research tools',
            tools: functions,
          },
          ...others,
        ]
      : others;
  }
  return body;
}
