import * as repo from '../db/repository.js';
import {
  localBuildRoutine,
  localLogReview,
  matchProduct,
  pauseActivesInRoutines,
  resumeActivesInRoutines,
  stepsFromPlan,
  type PlannedStep,
  type ProductCategory,
  type ProductStatus,
  type RoutineSlot,
  type SkinLog,
  type SkinProduct,
} from '../../shared/skin.js';
import { id } from '../lib/ids.js';

export const SKIN_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'skin_get_state',
      description: 'Read the current skin profile, product shelf, AM/PM routines, and recent logs.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'skin_save_profile',
      description: 'Update skin type, concerns, sensitivities, or goals.',
      parameters: {
        type: 'object',
        properties: {
          skinType: { type: 'string', enum: ['unknown', 'normal', 'dry', 'oily', 'combination', 'sensitive'] },
          concerns: { type: 'array', items: { type: 'string' } },
          sensitivities: { type: 'array', items: { type: 'string' } },
          goals: { type: 'array', items: { type: 'string' } },
          climate: { type: 'string' },
          notes: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'skin_search_products',
      description: 'Search the user shelf by name, brand, category, or active ingredient. Always search before building a routine.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          category: { type: 'string' },
          slot: { type: 'string', enum: ['am', 'pm'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'skin_add_product',
      description: 'Add one product to the shelf.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          brand: { type: 'string' },
          category: { type: 'string' },
          actives: { type: 'array', items: { type: 'string' } },
          usedIn: { type: 'array', items: { type: 'string', enum: ['am', 'pm'] } },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'skin_set_routine',
      description:
        'Replace AM and/or PM routine. Each step.product is a name from the shelf. The server matches names to real products and links them. Search products first, then call this.',
      parameters: {
        type: 'object',
        properties: {
          am: {
            type: 'array',
            items: {
              type: 'object',
              properties: { product: { type: 'string' }, waitMin: { type: 'number' } },
              required: ['product'],
            },
          },
          pm: {
            type: 'array',
            items: {
              type: 'object',
              properties: { product: { type: 'string' }, waitMin: { type: 'number' } },
              required: ['product'],
            },
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'skin_pause_actives',
      description: 'Pause treatment/exfoliant/retinoid/acid steps without deleting them. Use when irritation is high or barrier is damaged.',
      parameters: { type: 'object', properties: { reason: { type: 'string' } } },
    },
  },
  {
    type: 'function',
    function: {
      name: 'skin_resume_actives',
      description: 'Unpause previously paused routine steps.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'skin_comment_log',
      description: 'Write an AI comment onto a daily skin log (usually today).',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string' },
          comment: { type: 'string' },
          adjustments: { type: 'array', items: { type: 'string' } },
        },
        required: ['comment'],
      },
    },
  },
];

export function createSkinToolRuntime() {
  const actions: string[] = [];

  async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case 'skin_get_state':
        return compactSkin();
      case 'skin_save_profile': {
        const profile = repo.saveSkinProfile(args);
        actions.push('Updated skin profile');
        return { ok: true, profile };
      }
      case 'skin_search_products':
        return searchProducts(String(args.query || ''), args.category ? String(args.category) : '', args.slot === 'pm' ? 'pm' : args.slot === 'am' ? 'am' : '');
      case 'skin_add_product': {
        if (!String(args.name || '').trim()) return { ok: false, error: 'Name required' };
        const product = repo.saveSkinProduct({
          id: id('skinprod'),
          name: String(args.name),
          brand: String(args.brand || ''),
          category: (args.category as ProductCategory) || 'other',
          actives: Array.isArray(args.actives) ? args.actives.map(String) : [],
          usedIn: Array.isArray(args.usedIn) ? (args.usedIn.filter((s) => s === 'am' || s === 'pm') as RoutineSlot[]) : [],
          status: 'active' as ProductStatus,
          openedAt: '',
          expiresAt: '',
          notes: '',
          pros: [],
          cons: [],
          useCase: '',
          bestFor: [],
          createdAt: new Date().toISOString(),
        });
        actions.push(`Added product ${product.name}`);
        return { ok: true, product };
      }
      case 'skin_set_routine': {
        const result = applyNamedRoutines(args.am as PlannedStep[] | undefined, args.pm as PlannedStep[] | undefined);
        actions.push(...result.actions);
        return result;
      }
      case 'skin_pause_actives': {
        const skin = repo.loadSkinState();
        const { routines, paused } = pauseActivesInRoutines(skin.routines, skin.products);
        for (const r of routines) repo.saveSkinRoutine(r);
        const reason = String(args.reason || 'barrier / irritation');
        actions.push(paused.length ? `Paused actives: ${paused.join(', ')} (${reason})` : 'No actives to pause');
        return { ok: true, paused, reason };
      }
      case 'skin_resume_actives': {
        const skin = repo.loadSkinState();
        const { routines, resumed } = resumeActivesInRoutines(skin.routines);
        for (const r of routines) repo.saveSkinRoutine(r);
        actions.push(resumed.length ? `Resumed: ${resumed.join(', ')}` : 'Nothing was paused');
        return { ok: true, resumed };
      }
      case 'skin_comment_log': {
        const date = String(args.date || new Date().toISOString().slice(0, 10));
        const existing = repo.listSkinLogs().find((l) => l.date === date);
        if (!existing) return { ok: false, error: `No log for ${date}` };
        const log = repo.saveSkinLog({
          ...existing,
          aiComment: String(args.comment || ''),
          aiAdjustments: Array.isArray(args.adjustments) ? args.adjustments.map(String) : existing.aiAdjustments || [],
        });
        actions.push(`Commented on ${date} log`);
        return { ok: true, log };
      }
      default:
        return { error: `Unknown tool ${name}` };
    }
  }

  return { tools: SKIN_TOOLS, executeTool, actions };
}

function compactSkin() {
  const skin = repo.loadSkinState();
  return {
    profile: skin.profile,
    products: skin.products.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      actives: p.actives,
      usedIn: p.usedIn,
      status: p.status,
      pros: p.pros || [],
      cons: p.cons || [],
      useCase: p.useCase || '',
      bestFor: p.bestFor || [],
    })),
    routines: skin.routines.map((r) => ({
      slot: r.slot,
      steps: r.steps.map((s) => ({
        label: s.label,
        productId: s.productId || null,
        paused: Boolean(s.paused),
        waitMin: s.waitMin,
        missing: !s.productId,
      })),
    })),
    recentLogs: [...skin.logs]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8)
      .map((l) => ({
        date: l.date,
        barrier: l.barrier,
        hydration: l.hydration,
        oiliness: l.oiliness,
        irritation: l.irritation,
        concerns: l.concerns,
        notes: l.notes,
        routineDone: l.routineDone,
        aiComment: l.aiComment || null,
      })),
  };
}

function searchProducts(query: string, category: string, slot: string) {
  const products = repo.listSkinProducts().filter((p) => p.status === 'active' || p.status === 'paused');
  const q = query.toLowerCase().trim();
  const hits = products.filter((p) => {
    if (category && p.category !== category) return false;
    if (slot && p.usedIn.length && !p.usedIn.includes(slot as RoutineSlot)) return false;
    if (!q) return true;
    return matchProduct(q, [p]) !== null || `${p.brand} ${p.name} ${(p.actives || []).join(' ')}`.toLowerCase().includes(q);
  });
  return {
    count: hits.length,
    products: hits.slice(0, 20).map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      actives: p.actives,
      usedIn: p.usedIn,
      status: p.status,
      pros: p.pros || [],
      cons: p.cons || [],
      useCase: p.useCase || '',
      bestFor: p.bestFor || [],
    })),
  };
}

export function applyNamedRoutines(am?: PlannedStep[], pm?: PlannedStep[]) {
  const products = repo.listSkinProducts();
  const existing = repo.listSkinRoutines();
  const actions: string[] = [];
  const write = (slot: RoutineSlot, plan: PlannedStep[]) => {
    const current = existing.find((r) => r.slot === slot);
    const steps = stepsFromPlan(plan, products, `${slot}`);
    const linked = steps.filter((s) => s.productId).length;
    const missing = steps.filter((s) => !s.productId).map((s) => s.label);
    repo.saveSkinRoutine({
      id: current?.id || `routine-${slot}`,
      slot,
      name: slot === 'am' ? 'AM routine' : 'PM routine',
      steps,
      updatedAt: new Date().toISOString(),
    });
    actions.push(
      `Set ${slot.toUpperCase()} routine (${steps.length} steps, ${linked} linked to shelf${missing.length ? `, missing: ${missing.join(', ')}` : ''})`,
    );
    return { linked, missing, steps: steps.map((s) => s.label) };
  };
  return {
    ok: true,
    am: Array.isArray(am) ? write('am', am) : null,
    pm: Array.isArray(pm) ? write('pm', pm) : null,
    actions,
  };
}

export function applyLocalBuild(): { am: PlannedStep[]; pm: PlannedStep[]; actions: string[] } {
  const plan = localBuildRoutine(repo.listSkinProducts());
  const result = applyNamedRoutines(plan.am, plan.pm);
  return { ...plan, actions: result.actions };
}

export function applyLocalLogReview(log: SkinLog): { comment: string; adjustments: string[]; paused: string[] } {
  const skin = repo.loadSkinState();
  const review = localLogReview(skin, log);
  let paused: string[] = [];
  if (review.pauseActives) {
    const next = pauseActivesInRoutines(skin.routines, skin.products);
    paused = next.paused;
    for (const r of next.routines) repo.saveSkinRoutine(r);
  }
  const adjustments = [...review.adjustments, ...paused.map((p) => `Paused ${p}`)];
  repo.saveSkinLog({ ...log, aiComment: review.comment, aiAdjustments: adjustments });
  return { comment: review.comment, adjustments, paused };
}
