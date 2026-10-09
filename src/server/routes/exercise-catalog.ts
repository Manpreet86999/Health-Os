import { Router } from 'express';
import { requestCatalog, readCatalogCache, syncExerciseCatalog, retryPendingExerciseReferences } from '../services/exercise-catalog.js';
import { mediaIntegrationStatus,saveMediaIntegrationKeys } from '../services/exercise-media-enrichment.js';
export const exerciseCatalogRouter = Router();
exerciseCatalogRouter.post('/exercise-catalog/report-broken',async(req,res)=>{
  const catalog=requestCatalog(req);
  if(!catalog)return res.status(401).json({error:'Sign in to report media'});
  try{res.json(await catalog.reportBrokenMedia(String(req.body?.exerciseId || ''),String(req.body?.mediaId || '')));}catch{res.status(503).json({error:'Media report unavailable'});}
});
exerciseCatalogRouter.get('/exercise-catalog/integrations',(_req,res)=>res.json(mediaIntegrationStatus()));
exerciseCatalogRouter.post('/exercise-catalog/integrations',(req,res)=>{
  for(const key of ['youtubeApiKey']) if(req.body?.[key]!==undefined && (typeof req.body[key]!=='string' || req.body[key].length>500)) return res.status(400).json({error:'Invalid provider key'});
  saveMediaIntegrationKeys(req.body || {});
  res.json(mediaIntegrationStatus());
});
exerciseCatalogRouter.post('/exercise-catalog/sync',async(req,res) => {
  const catalog=requestCatalog(req);
  if(!catalog) return res.status(401).json({error:'Sign in to synchronize exercises'});
  try {
    await syncExerciseCatalog(catalog);
    await retryPendingExerciseReferences(catalog);
    res.json({ok:true,lastExerciseCatalogSyncAt:readCatalogCache()?.syncedAt});
  } catch { res.status(503).json({error:'Catalog sync unavailable. Cached exercises remain available.'}); }
});
