import test from 'node:test';
import assert from 'node:assert/strict';
import { runSkinProductResearch } from './ai/engine.js';

test('a pasted product URL reads the exact page before general search', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({
      results: [{ url: 'https://shop.example/products/face-cleanser', raw_content: 'Example Face Cleanser. Gentle cleanser for dry skin.' }],
    }), { status: 200 });
  };
  try {
    const result = await runSkinProductResearch({ tavilyApiKey: 'test' } as any, 'https://shop.example/products/face-cleanser');
    assert.equal(result.ok, true);
    assert.equal(result.sources?.[0].url, 'https://shop.example/products/face-cleanser');
    assert.match(result.sources?.[0].content || '', /Gentle cleanser/);
    assert.deepEqual(calls, ['https://api.tavily.com/extract']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a product URL remains addable when extraction is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Should not fetch without Tavily'); };
  try {
    const result = await runSkinProductResearch({} as any, 'https://www.amazon.com/dp/B123EXAMPLE');
    assert.equal(result.ok, true);
    assert.equal(result.sources?.[0].url, 'https://www.amazon.com/dp/B123EXAMPLE');
    assert.equal(result.proposal, undefined);
    assert.match(result.answer || '', /enter the product yourself/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AI failure reports the provider reason and keeps the source for manual entry', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).includes('tavily.com/extract')) {
      return new Response(JSON.stringify({
        results: [{ url: 'https://shop.example/products/face-cleanser', raw_content: 'Example Face Cleanser.' }],
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: { message: 'Rate limited' } }), { status: 429 });
  };
  try {
    const result = await runSkinProductResearch({
      tavilyApiKey: 'test', aiProvider: 'nvidia', aiApiKey: 'test', aiModel: 'test-model',
    } as any, 'https://shop.example/products/face-cleanser');
    assert.equal(result.ok, true);
    assert.equal(result.proposal, undefined);
    assert.match(result.error || '', /Rate limited/);
    assert.equal(result.sources?.[0].url, 'https://shop.example/products/face-cleanser');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('product AI requests enough output and a structured answer', async () => {
  const originalFetch = globalThis.fetch;
  const aiRequests: Array<Record<string, any>> = [];
  globalThis.fetch = async (input, init) => {
    if (String(input).includes('tavily.com/extract')) {
      return new Response(JSON.stringify({
        results: [{ url: 'https://shop.example/products/face-cleanser', raw_content: 'Example Face Cleanser by Example Brand.' }],
      }), { status: 200 });
    }
    aiRequests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
        name: 'Example Face Cleanser', brand: 'Example Brand', category: 'cleanser',
        actives: [], useCase: 'Cleansing', bestFor: [], sourceUrl: 'https://shop.example/products/face-cleanser',
      }) } }],
    }), { status: 200 });
  };
  try {
    const result = await runSkinProductResearch({
      tavilyApiKey: 'test', aiProvider: 'openrouter', aiApiKey: 'test', aiModel: 'deepseek/deepseek-v4.1-flash',
    } as any, 'https://shop.example/products/face-cleanser');
    assert.equal(result.proposal?.name, 'Example Face Cleanser');
    assert.equal(aiRequests[0]?.max_tokens, 4096);
    assert.deepEqual(aiRequests[0]?.reasoning, { effort: 'low' });
    assert.equal(aiRequests[0]?.response_format?.type, 'json_schema');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('blocked Amazon extraction finds the same ASIN at a canonical listing URL', async () => {
  const originalFetch = globalThis.fetch;
  let searchQuery = '';
  globalThis.fetch = async (input, init) => {
    if (String(input).includes('tavily.com/extract')) {
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }
    searchQuery = (JSON.parse(String(init?.body)) as { query: string }).query;
    return new Response(JSON.stringify({ results: [
      { title: 'Minimalist Niacinamide 10% Serum', url: 'https://www.amazon.in/dp/B08F9MF314', content: 'Minimalist Niacinamide 10% serum, 30 ml.' },
      { title: 'Different serum', url: 'https://www.amazon.in/dp/B00OTHER12', content: 'Another product.' },
    ] }), { status: 200 });
  };
  try {
    const originalUrl = 'https://www.amazon.in/Minimalist-Niacinamide-Blemishes-Balancing-Clarifying/dp/B08F9MF314?th=1';
    const result = await runSkinProductResearch({ tavilyApiKey: 'test' } as any, originalUrl);
    assert.match(searchQuery, /B08F9MF314 site:amazon.in/);
    assert.equal(result.ok, true);
    assert.equal(result.sources?.[0].url, originalUrl);
    assert.match(result.sources?.[0].content || '', /Niacinamide 10% serum/);
    assert.equal(result.sources?.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
