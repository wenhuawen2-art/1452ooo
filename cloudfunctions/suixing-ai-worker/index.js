const cloudbase = require('@cloudbase/node-sdk');
const { createAiWorker } = require('./worker.cjs');
const { createModelGenerator, MODEL_TIMEOUT_MS } = require('./model.cjs');

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV, timeout: MODEL_TIMEOUT_MS, retries: 0 });
const run = createAiWorker({ db: app.database(), generate: createModelGenerator(app) });

exports.main = async (event) => {
  try { return await run(event); }
  catch (error) {
    // Do not leak prompts, model responses, job contents, or runtime credentials.
    const code = /^AI_[A-Z_]+$/.test(String(error?.code || '')) ? error.code : 'AI_WORKER_FAILED';
    console.error('[ai-worker]', { code });
    return { ok: false, code };
  }
};
