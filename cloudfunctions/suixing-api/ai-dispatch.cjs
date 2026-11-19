const { createHash, createHmac } = require('node:crypto');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hmac = (key, value, encoding) => createHmac('sha256', key).update(value).digest(encoding);
const dispatchError = (code, message) => Object.assign(new Error(message), { status: 503, code });
const validJobId = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(value);

function signJobEvent(jobId, issuedAt, secret) {
  if (!validJobId(jobId) || !Number.isSafeInteger(issuedAt) || typeof secret !== 'string' || secret.length < 32)
    throw dispatchError('AI_DISPATCH_CONFIG', 'AI 任务调度尚未配置');
  return { jobId, issuedAt, signature: hmac(secret, `${issuedAt}.${jobId}`, 'hex') };
}

function createDispatcher({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now, getCredentials } = {}) {
  return async function dispatchAiJob(jobId, invocationContext) {
    let credentials;
    try { credentials = getCredentials ? await getCredentials(invocationContext) : env; }
    catch { throw dispatchError('AI_DISPATCH_CONFIG', 'AI 任务调度尚未配置'); }
    const secret = String(env.AI_WORKER_SECRET || '');
    // Resolve rotating role credentials for each invocation, never at module load.
    // A caller may supply cloudbase.getCloudbaseContext(invocationContext) here.
    const secretId = String(credentials?.TENCENTCLOUD_SECRETID || credentials?.secretId || '');
    const secretKey = String(credentials?.TENCENTCLOUD_SECRETKEY || credentials?.secretKey || '');
    const token = String(credentials?.TENCENTCLOUD_SESSIONTOKEN || credentials?.sessionToken || '');
    const region = String(env.AI_SCF_REGION || credentials?.TENCENTCLOUD_REGION || env.TENCENTCLOUD_REGION || '');
    const namespace = String(env.AI_SCF_NAMESPACE || '');
    const functionName = String(env.AI_WORKER_FUNCTION || 'suixing-ai-worker');
    // Runtime role credentials only: no embedded keys or browser-provided identity.
    if (env.AI_ENABLED !== 'true' || secret.length < 32 || !secretId || !secretKey || !token || !region || !namespace ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(functionName) || !/^[a-zA-Z0-9_-]{1,128}$/.test(namespace) ||
        !/^[a-z]+-[a-z]+(?:-[a-z]+)?$/.test(region) || typeof fetchImpl !== 'function')
      throw dispatchError('AI_DISPATCH_CONFIG', 'AI 任务调度尚未配置');
    const issuedAt = now();
    const payload = JSON.stringify({ FunctionName: functionName, Namespace: namespace, InvocationType: 'Event',
      ClientContext: JSON.stringify(signJobEvent(jobId, issuedAt, secret)) });
    const timestamp = Math.floor(issuedAt / 1000);
    const date = new Date(issuedAt).toISOString().slice(0, 10);
    const host = 'scf.tencentcloudapi.com';
    const contentType = 'application/json; charset=utf-8';
    const signedHeaders = 'content-type;host;x-tc-action';
    const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-tc-action:invoke\n`;
    const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256(payload)}`;
    const scope = `${date}/scf/tc3_request`;
    const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${sha256(canonicalRequest)}`;
    const signingKey = hmac(hmac(hmac(`TC3${secretKey}`, date), 'scf'), 'tc3_request');
    const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${hmac(signingKey, stringToSign, 'hex')}`;
    let response;
    try {
      response = await fetchImpl(`https://${host}`, { method: 'POST', headers: {
        'Content-Type': contentType, Host: host, 'X-TC-Action': 'Invoke', 'X-TC-Version': '2018-04-16',
        'X-TC-Timestamp': String(timestamp), 'X-TC-Region': region, 'X-TC-Token': token, Authorization: authorization,
      }, body: payload, signal: AbortSignal.timeout(8000) });
    } catch {
      throw dispatchError('AI_DISPATCH_UNCERTAIN', '任务提交状态正在确认，请稍后查看');
    }
    let result;
    try { result = await response.json(); }
    catch { throw dispatchError('AI_DISPATCH_UNCERTAIN', '任务提交状态正在确认，请稍后查看'); }
    const api = result?.Response;
    if (api?.Error) throw dispatchError('AI_DISPATCH_REJECTED', 'AI 任务暂时无法启动，请稍后重试');
    if (!response.ok || !api?.RequestId)
      throw dispatchError('AI_DISPATCH_UNCERTAIN', '任务提交状态正在确认，请稍后查看');
    return { requestId: String(api.RequestId), functionRequestId: String(api.Result?.FunctionRequestId || '') };
  };
}

module.exports = { createDispatcher, signJobEvent };
