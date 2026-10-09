export {
  DEFAULT_OPENROUTER_MODEL,
  OPENROUTER_FREE_CHAT_MODELS,
  openRouterFallbackChain,
  modelLabel,
} from './models.js';
export { chatCompletion, probeModel } from './client.js';
export { buildAthleteContext } from './context.js';
export {
  listFreeModels,
  benchmarkFreeModels,
  testAiConnection,
  runAiCoach,
  runSessionBrief,
  runAiAsk,
  runSkinAsk,
  runSkinLogReview,
  runSkinBuildRoutine,
} from './engine.js';
