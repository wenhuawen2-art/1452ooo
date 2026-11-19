const MODEL_TIMEOUT_MS = 90000;

// Inspect only the public text field of a partially received JSON answer.
function publicReplyPhase(json) {
  const field = json.match(/^\s*(?:```(?:json)?\s*)?\{\s*"text:?"\s*:\s*"((?:[^"\\]|\\[\s\S])*)/i);
  if (!field?.[1]) return 'reply';
  let text;
  try { text = JSON.parse(`"${field[1]}"`); }
  catch { return 'reply'; } // A JSON escape can span two chunks.
  if (/(?:^|\n)[ \t]*(?:#{1,6}[ \t]+)?(?:\*\*)?(?:准备清单|行前清单)(?:\*\*)?[ \t]*(?=[:：\r\n])/.test(text)) return 'checklist';
  if (/(?:^|\n)[ \t]*(?:#{1,6}[ \t]+)?(?:\*\*)?(?:每日安排|每日行程)(?:\*\*)?[ \t]*(?=[:：\r\n])/.test(text)) return 'itinerary';
  return 'reply';
}

function finalResult(text, finishReason, usage = {}) {
  if (finishReason === 'length')
    throw Object.assign(new Error('内容较长，请缩小日期或清单范围后重试'), { code: 'AI_OUTPUT_TRUNCATED' });
  if (finishReason !== 'stop' || typeof text !== 'string' || !text.trim())
    throw Object.assign(new Error('模型未返回最终回答'), { code: 'AI_INVALID_RESPONSE' });
  // Only return the public answer and numeric token usage.
  const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens;
  return { text, usage: {
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    total_tokens: usage.total_tokens,
    ...(Number.isSafeInteger(reasoningTokens) && reasoningTokens >= 0 ? { reasoning_tokens: reasoningTokens } : {}),
  } };
}

async function collectReply(stream, reportPhase) {
  let text = '', finishReason, usage = {};
  for await (const chunk of stream) {
    const choice = chunk.choices?.[0];
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    const tokenUsage = chunk.rawResponse?.usage || chunk.usage;
    if (tokenUsage) usage = { ...usage, ...tokenUsage };
    const content = choice?.delta?.content;
    if (typeof content !== 'string' || !content) continue;
    text += content;
    if (text.length > 65536) throw Object.assign(new Error('生成内容过长'), { code: 'AI_OUTPUT_TRUNCATED' });
    reportPhase(publicReplyPhase(text));
  }
  return finalResult(text, finishReason, usage);
}

function modelProvider(env) {
  const provider = env.AI_MODEL_PROVIDER === undefined ? 'cloudbase' : env.AI_MODEL_PROVIDER;
  return provider === 'cloudbase' || provider === 'hunyuan-v3' ? provider : null;
}

function createModelGenerator(app, env = process.env) {
  // hy3 counts reasoning and the final answer against the same output budget.
  const thinking = env.AI_THINKING_MODE === 'enabled';
  const modelOptions = thinking
    ? { thinking: { type: 'enabled' }, reasoning_effort: 'low' }
    : { thinking: { type: 'disabled' } };
  return async function generate(messages, reportPhase) {
    const provider = modelProvider(env);
    if (!provider) throw Object.assign(new Error('AI 模型分组配置无效'), { code: 'AI_WORKER_CONFIG' });
    // The installed default provider ignores per-call timeout. index.js also sets
    // the app request timeout, which its AI request adapter actually forwards.
    // The legacy hunyuan-v3 JSON mode can put an entire draft in a single
    // object key. Its plain completion follows the prompt's JSON examples.
    const model = app.ai().createModel(provider);
    const input = {
      model: 'hy3', messages, ...modelOptions, max_tokens: thinking ? 16384 : 8192,
      maxSteps: 1, ...(provider === 'cloudbase' ? { response_format: { type: 'json_object' } } : {}),
    };
    const options = { timeout: MODEL_TIMEOUT_MS };
    if (reportPhase && typeof model.streamText === 'function') {
      const result = await model.streamText(input, options);
      if (result?.error || !result?.dataStream) throw Object.assign(new Error('模型生成失败'), { code: 'AI_MODEL_FAILED' });
      return collectReply(result.dataStream, reportPhase);
    }
    const result = await model.generateText(input, options);
    if (result?.error) throw Object.assign(new Error('模型生成失败'), { code: 'AI_MODEL_FAILED' });
    const raw = result?.rawResponses?.[0];
    const choice = raw?.choices?.[0];
    return finalResult(choice?.message?.content, choice?.finish_reason, raw?.usage);
  };
}

module.exports = { createModelGenerator, modelProvider, publicReplyPhase, MODEL_TIMEOUT_MS };
