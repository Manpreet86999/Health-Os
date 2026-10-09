import { PORT } from '../config.js';
import type { AiProviderId } from './models.js';
import { DEFAULT_OPENROUTER_MODEL, NVIDIA_DEFAULT_MODEL, OPENROUTER_CHAT_MODELS, openRouterFallbackChain } from './models.js';
import { executeMcpTool } from './mcp.js';
import { safeAiError } from './errors.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{type:'text';text:string}|{type:'image_url';image_url:{url:string}}> ;
}

export interface ChatRequest {
  provider: AiProviderId | string;
  apiKey: string;
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Try fallback free models on OpenRouter failure */
  useFallback?: boolean;
  /** Optional array of tools (e.g. MCP tools) for the model to use */
  tools?: any[];
  /** If set, tool calls are dispatched here first (skin tools, etc). Unknown names fall back to MCP. */
  executeTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Provider-supported structured response format for requests that must return JSON. */
  responseFormat?: unknown;
  /** Keep simple extraction tasks from spending their output budget on reasoning. */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export interface ChatSuccess {
  ok: true;
  content: string;
  model: string;
  provider: string;
  latencyMs: number;
  attempts: Array<{ model: string; ok: boolean; error?: string; status?: number }>;
}

export interface ChatFailure {
  ok: false;
  error: string;
  attempts: Array<{ model: string; ok: boolean; error?: string; status?: number }>;
}

export type ChatResult = ChatSuccess | ChatFailure;

function endpoint(provider: string): string {
  if (provider === 'nvidia') return 'https://integrate.api.nvidia.com/v1/chat/completions';
  if (provider === 'ollama') return 'http://127.0.0.1:11434/v1/chat/completions';
  return 'https://openrouter.ai/api/v1/chat/completions';
}

function headersFor(provider: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey && provider !== 'ollama') {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = `http://127.0.0.1:${PORT}`;
    headers['X-Title'] = 'Health OS';
  }
  return headers;
}

async function oneShot(
  provider: string,
  apiKey: string,
  model: string,
  messages: any[],
  temperature: number,
  maxTokens: number,
  tools?: any[],
  responseFormat?: unknown,
  reasoningEffort?: 'low' | 'medium' | 'high',
): Promise<{ ok: true; content: string; tool_calls?: any[]; model?: string } | { ok: false; error: string; status?: number; outputLimit?: boolean; emptyAnswer?: boolean; retryable?: boolean; refused?:boolean }> {
  const started = Date.now();
  try {
    const payloadReq: any = {
      model,
      temperature,
      messages,
    };
    if (tools && tools.length > 0) {
      payloadReq.tools = tools;
    }
    if (responseFormat && provider === 'openrouter') payloadReq.response_format = responseFormat;
    if (reasoningEffort && provider === 'openrouter') {
      const supported = OPENROUTER_CHAT_MODELS.find(entry => entry.id === model)?.reasoningEfforts;
      payloadReq.reasoning = { effort: supported && !supported.includes(reasoningEffort) ? supported.at(-1) : reasoningEffort };
    }
    // Ollama (especially reasoning models) may need to generate many reasoning tokens before outputting content.
    // Restricting max_tokens causes them to abort early with empty content.
    if (provider !== 'ollama') {
      payloadReq.max_tokens = maxTokens;
    }
    
    const response = await fetch(endpoint(provider), {
      method: 'POST',
      headers: headersFor(provider, apiKey),
      body: JSON.stringify(payloadReq),
      signal: AbortSignal.timeout(60000), // increased timeout for tool calling models
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string } | string;
      message?: string;
      model?: string;
      choices?: Array<{ finish_reason?: string; message?: { content?: unknown; refusal?: string; tool_calls?: any[] } }>;
    };
    if (!response.ok || payload.error) {
      const rawError = safeAiError((typeof payload.error === 'string' ? payload.error : payload.error?.message) || payload.message || `HTTP ${response.status}`, apiKey);
      const hint = response.status === 401 || response.status === 403
        ? ' Check that the API key belongs to this provider and was copied completely.'
        : response.status === 402
          ? ' This provider needs available credit or an eligible free-model allowance.'
          : response.status === 429
            ? ' You reached the provider rate limit. Wait a few minutes and try again.'
            : response.status === 400 && /provider returned error/i.test(rawError)
              ? ' The provider has no available route for this model right now. Retry, or choose a current :free model from the provider catalogue.'
              : '';
      return {
        ok: false,
        status: response.status,
        retryable: response.status >= 500 || response.status === 408 || response.status === 400 && /provider returned error/i.test(rawError),
        error: `${provider} · ${model} · HTTP ${response.status}: ${rawError}.${hint}`,
      };
    }
    const choice = payload.choices?.[0];
    const msg = choice?.message;
    const content = typeof msg?.content === 'string' ? msg.content.trim() : Array.isArray(msg?.content)
      ? msg.content.filter(part => part && ['text','output_text'].includes(part.type) && typeof part.text === 'string').map(part => part.text).join('\n').trim() : '';
    const tool_calls = msg?.tool_calls;

    // The free router can choose a moderation classifier. Its labels are not coach answers.
    const actualModel = typeof payload.model === 'string' ? payload.model : model;
    if (/(?:content[-_]safety|(?:^|[\/_-])(?:llama[-_]?guard|moderation)(?:[\/_:-]|$))/i.test(actualModel)) {
      return {ok:false,status:response.status,error:`${provider} · ${actualModel}: This is a moderation model, not a chat coach. Choose a chat model in Settings or try again.`};
    }

    if (choice?.finish_reason === 'length' && (!tool_calls || tool_calls.length === 0)) return {ok:false,status:response.status,outputLimit:true,error:`Model used its ${maxTokens}-token output limit before completing an answer. Please try again.`};

    if (!content && (!tool_calls || tool_calls.length === 0)) {
      if (msg?.refusal || choice?.finish_reason === 'content_filter') return { ok:false, status:response.status, refused:true, error:`${provider} · ${model}: The provider declined this request. Rephrase it and try again.` };
      return { ok: false, status: response.status, emptyAnswer:true, error: `${provider} · ${payload.model || model}: Model returned no answer (finish reason: ${choice?.finish_reason || 'unknown'}). Please try again.` };
    }
    return { ok: true, content, tool_calls, model:actualModel };
  } catch (e) {
    const timeout=e instanceof Error && ['TimeoutError','AbortError'].includes(e.name);
    return { ok: false, error: `${provider} · ${model}: ${timeout?'The AI provider timed out. Please try again.':safeAiError(e,apiKey)}` };
  }
}

/**
 * Chat completion with OpenRouter free-model fallback chain.
 * Local provider short-circuits (no network).
 */
export async function chatCompletion(req: ChatRequest): Promise<ChatResult> {
  const provider = (req.provider || 'local').toLowerCase();
  const attempts: ChatSuccess['attempts'] = [];

  if (provider === 'local') {
    return { ok: false, error: 'Local coach only (no network).', attempts };
  }
  if (provider !== 'ollama' && !req.apiKey) {
    return { ok: false, error: 'No AI provider or API key configured.', attempts };
  }

  const t0 = Date.now();
  let models: string[];
  if (provider === 'nvidia') {
    models = [req.model || NVIDIA_DEFAULT_MODEL];
  } else if (provider === 'openrouter') {
    models =
      req.useFallback === false
        ? [req.model || DEFAULT_OPENROUTER_MODEL]
        : openRouterFallbackChain(req.model || DEFAULT_OPENROUTER_MODEL);
  } else {
    models = [req.model || DEFAULT_OPENROUTER_MODEL];
  }

  // Keep tool results across fallbacks so recovery cannot replay an already executed tool.
  let currentMessages = [...req.messages];
  let outputRetries = 0, retriedEmpty = false, retriedProvider = false;
  let tokenBudget = req.maxTokens ?? 25000;
  for (const model of models) {
    let isDone = false;
    let finalContent = '';
    let callAttempts = 0;
    let actualModel = model;

    while (!isDone && callAttempts < 5) {
      callAttempts++;
      const result = await oneShot(
        provider === 'nvidia' ? 'nvidia' : provider === 'ollama' ? 'ollama' : 'openrouter',
        req.apiKey || '',
        model,
        currentMessages,
        req.temperature ?? 0.35,
        tokenBudget,
        req.tools,
        req.responseFormat,
        req.reasoningEffort ?? 'low',
      );
      
      if (!result.ok) {
        attempts.push({ model, ok: false, error: result.error, status: result.status });
        if (result.refused) return {ok:false,error:result.error,attempts};
        if (result.outputLimit && outputRetries < 2 && provider !== 'ollama' && tokenBudget < 32000) {
          outputRetries++;
          tokenBudget = Math.min(Math.max(tokenBudget * 2, 4096), 32000);
          continue;
        }
        if (result.emptyAnswer && !retriedEmpty) { retriedEmpty=true; if(provider!=='ollama')tokenBudget=Math.min(Math.max(tokenBudget,2048),32000); continue; }
        if (result.retryable && !retriedProvider) { retriedProvider=true; continue; }
        if (result.status === 401 || result.status === 403) return { ok: false, error: result.error, attempts };
        break; // Break the while loop to try next model in fallback chain
      }
      actualModel=result.model || actualModel;

      if (result.tool_calls && result.tool_calls.length > 0) {
        // The AI requested a tool call
        currentMessages.push({
          role: 'assistant',
          content: result.content || '',
          tool_calls: result.tool_calls
        } as any);

        // Execute all requested tools
        for (const tc of result.tool_calls) {
          try {
            const args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments || '{}') : tc.function.arguments;
            const name = String(tc.function.name || '');
            console.log(`[AI] Executing tool ${name}...`);
            let toolResult: unknown;
            if (req.executeTool) {
              toolResult = await req.executeTool(name, args || {});
            } else {
              toolResult = await executeMcpTool(name, args);
            }
            currentMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name,
              content: JSON.stringify(toolResult)
            } as any);
          } catch (err: any) {
            console.error(`[AI] Tool error:`, err);
            currentMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.function.name,
              content: JSON.stringify({ error: err.message })
            } as any);
          }
        }
        // Loop continues to send tool results back to the model
      } else {
        // Final response received
        finalContent = result.content;
        isDone = true;
      }
    }

    if (isDone) {
      attempts.push({ model, ok: true });
      return {
        ok: true,
        content: finalContent,
        model:actualModel,
        provider: provider === 'nvidia' ? 'nvidia' : provider === 'ollama' ? 'ollama' : 'openrouter',
        latencyMs: Date.now() - t0,
        attempts,
      };
    }
    if (callAttempts >= 5 && !attempts.some(attempt=>attempt.model===model)) attempts.push({model,ok:false,error:'The AI reached its tool-call limit without a final answer. Please try a simpler request.'});
  }

  const last = attempts[attempts.length - 1];
  return {
    ok: false,
    error: last?.error || 'All AI models failed',
    attempts,
  };
}

/** Lightweight probe used by /api/ai/test and model ranking. */
export async function probeModel(
  apiKey: string,
  model: string,
  provider: 'openrouter' | 'nvidia' | 'ollama' = 'openrouter',
): Promise<{ ok: boolean; model: string; latencyMs: number; error?: string; sample?: string }> {
  const t0 = Date.now();
  const result = await chatCompletion({
    provider, apiKey, model, useFallback:model==='openrouter/free', temperature:0.2, maxTokens:128,
    messages: [
      {
        role: 'system',
        content: 'Reply with exactly one short sentence confirming you are a workout coach AI.',
      },
      { role: 'user', content: 'Ping. Confirm ready for training coaching.' },
    ],
  });
  if (!result.ok) {
    return { ok: false, model, latencyMs: Date.now() - t0, error: result.error };
  }
  return {
    ok: true,
    model,
    latencyMs: Date.now() - t0,
    sample: result.content.slice(0, 160),
  };
}

export async function autoRegulateSession(
  req: ChatRequest
): Promise<ChatResult> {
  // Use slightly higher temp for more dynamic changes
  req.temperature = 0.5;
  return chatCompletion(req);
}
