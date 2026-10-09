import test from 'node:test';
import assert from 'node:assert/strict';
import { runSkinAsk } from './ai/engine.js';
import { emptySkinState, localCareAdvice } from '../shared/skin.js';
import { validateCareProposal } from './services/care-proposal.js';

test('Care Coach uses a sufficient budget and returns a reviewable plan', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<Record<string, any>> = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({
        answer: 'Review this simple plan.',
        proposal: { reason: 'Fits the commitment', tasks: [
          { label: 'Gentle cleanse', area: 'face', productId: '', days: [], time: 'evening', minutes: 2, notes: '' },
        ] },
      }) } }],
    }), { status: 200 });
  };
  try {
    const skin = emptySkinState();
    const result = await runSkinAsk(skin, {
      aiProvider: 'openrouter', aiApiKey: 'test', aiModel: 'deepseek/deepseek-v4.1-flash',
    } as any, 'Build a weekly Care Plan from my products');
    assert.equal(result.ok, true);
    assert.ok(result.proposal);
    assert.equal(validateCareProposal(result.proposal, skin).tasks.length, 1);
    assert.equal(requests[0]?.max_tokens, 8192);
    assert.deepEqual(requests[0]?.reasoning, { effort: 'low' });
    assert.equal(requests[0]?.response_format?.type, 'json_object');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Care Coach reports plan generation failure instead of replacing it with a generic tip', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { content: null } }],
  }), { status: 200 });
  try {
    const result = await runSkinAsk(emptySkinState(), {
      aiProvider: 'openrouter', aiApiKey: 'test', aiModel: 'deepseek/deepseek-v4.1-flash',
    } as any, 'Build a realistic weekly Care Plan');
    assert.equal(result.ok, false);
    assert.match(result.error || '', /could not build a plan/i);
    assert.doesNotMatch(result.error || '', /Record what you notice/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Care Coach requires AI for a plan request', async () => {
  const result = await runSkinAsk(emptySkinState(), {} as any, 'Help me make a realistic plan from products I own');
  assert.equal(result.ok, false);
  assert.match(result.error || '', /Connect an AI provider/);
});

test('a safety answer remains attached to the pending Care Plan request', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    choices: [{ finish_reason: 'stop', message: { content: null } }],
  }), { status: 200 });
  try {
    const history = [
      { role: 'user' as const, content: 'Build a realistic weekly Care Plan using products I own.' },
      { role: 'ai' as const, content: 'Please tell me about sensitivity and your skin type. Once I know this, I can propose a weekly plan.' },
    ];
    const result = await runSkinAsk(emptySkinState(), {
      aiProvider: 'openrouter', aiApiKey: 'test', aiModel: 'deepseek/deepseek-v4.1-flash',
    } as any, 'I used the exfoliant before, have no sensitivity, and have dry skin.', history);
    assert.equal(result.ok, false);
    assert.match(result.error || '', /could not build a plan/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('offline Care advice never calls an empty plan ready', () => {
  const skin = emptySkinState();
  skin.care.onboardingComplete = true;
  const advice = localCareAdvice(skin, '2026-09-23').join(' ');
  assert.match(advice, /No Care Plan actions are saved yet/);
  assert.doesNotMatch(advice, /Care plan is ready/);
});

test('Care Coach repairs a one-sided AM/PM draft before showing it', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    const tasks = [{ label:'Cleanse', area:'face', productId:'', days:[], time:'evening', minutes:2, notes:'' }];
    if (calls === 2) tasks.unshift({ label:'Morning care', area:'face', productId:'', days:[], time:'morning', minutes:2, notes:'' });
    return new Response(JSON.stringify({ choices:[{ finish_reason:'stop', message:{ content:JSON.stringify({ answer:'Review AM and PM separately.', proposal:{reason:'Fits your commitment',tasks} }) } }] }), {status:200});
  };
  try {
    const result = await runSkinAsk(emptySkinState(), {
      aiProvider:'openrouter', aiApiKey:'test', aiModel:'deepseek/deepseek-v4.1-flash',
    } as any, 'Build separate AM and PM routines from my products');
    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    const times = (result.proposal as {tasks:Array<{time:string}>}).tasks.map(task => task.time);
    assert.deepEqual(times, ['morning','evening']);
  } finally { globalThis.fetch = originalFetch; }
});

test('Care Coach repairs an AM draft that omits requested cleansing and niacinamide', async () => {
  const originalFetch = globalThis.fetch;
  const skin = emptySkinState();
  skin.care.commitment.maxSteps = 5;
  skin.care.commitment.minutesPerDay = 10;
  skin.products = [
    {id:'cleanser',name:'Gentle Cleanser',brand:'Test',category:'cleanser',actives:[],status:'active'},
    {id:'serum',name:'Niacinamide Serum',brand:'Test',category:'serum',actives:['Niacinamide'],status:'active'},
    {id:'sunscreen',name:'SPF 50 Sunscreen',brand:'Test',category:'sunscreen',actives:[],status:'active'},
  ] as any;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    const task = (label:string, productId:string, time:string) => ({label,area:'face',productId,days:[],time,minutes:1,notes:''});
    const tasks = calls === 1
      ? [task('Sunscreen','sunscreen','morning'),task('Cleanse','cleanser','evening')]
      : [task('Cleanse','cleanser','morning'),task('Niacinamide','serum','morning'),task('Sunscreen','sunscreen','morning'),task('Cleanse','cleanser','evening')];
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({answer:'Review the daily plan.',proposal:{reason:'Full AM and PM',tasks}})}}]}),{status:200});
  };
  try {
    const result = await runSkinAsk(skin, {
      aiProvider:'openrouter',aiApiKey:'test',aiModel:'deepseek/deepseek-v4.1-flash',
    } as any, 'Build an AM and PM plan with morning cleanser and niacinamide serum');
    assert.equal(result.ok,true);
    assert.equal(calls,2);
    const tasks = validateCareProposal(result.proposal,skin).tasks;
    assert.equal(tasks.filter(task => task.time === 'morning').length,3);
    assert.equal(tasks.filter(task => task.time === 'evening').length,1);
  } finally { globalThis.fetch = originalFetch; }
});

test('Care Coach repairs a draft that says an extra sunscreen action is not counted', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    const tasks = [
      {label:'Sunscreen',area:'face',productId:'',days:[],time:'morning',minutes:1,notes:calls === 1 ? 'Reapply outdoors; this is not counted.' : 'Reapply outdoors when needed; include extra applications in your real time and action budget.'},
      {label:'Cleanse',area:'face',productId:'',days:[],time:'evening',minutes:1,notes:''},
    ];
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({answer:'Review this plan.',proposal:{reason:'Simple',tasks}})}}]}),{status:200});
  };
  try {
    const result = await runSkinAsk(emptySkinState(), {
      aiProvider:'openrouter',aiApiKey:'test',aiModel:'deepseek/deepseek-v4.1-flash',
    } as any, 'Build an AM and PM plan');
    assert.equal(result.ok,true);
    assert.equal(calls,2);
    assert.doesNotMatch(JSON.stringify(result.proposal),/not counted/);
  } finally { globalThis.fetch = originalFetch; }
});
