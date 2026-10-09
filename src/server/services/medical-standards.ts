import ucum from '@lhncbc/ucum-lhc';
import { MedplumClient, indexStructureDefinitionBundle, validateTypedValue, OperationOutcomeError } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import type { Bundle } from '@medplum/fhirtypes';
import { z } from 'zod';
import { ucum as unitAlias, type MedicalReport } from '../../shared/medical.js';

export function validateMedicalUnits(report:Pick<MedicalReport,'results'>){const utils=ucum.UcumLhcUtils.getInstance();return report.results.map(r=>{const v=r.unit?utils.validateUnitString(unitAlias(r.unit),false):{status:'invalid',ucumCode:undefined,msg:['Missing unit']};return {id:r.id,original:r.unit,normalized:unitAlias(r.unit),validation:{status:v.status,ucumCode:v.ucumCode,msg:v.msg}};});}
let definitionsLoaded=false;
export function validateLocalFhir(bundle:Bundle){
  if(!definitionsLoaded){indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);definitionsLoaded=true;}
  // Strip undefined optional fields before checking the actual serialized resource.
  const serialized=JSON.parse(JSON.stringify(bundle)) as Bundle;
  try{const issues=validateTypedValue({type:'Bundle',value:serialized});return {resourceType:'OperationOutcome',issue:issues.length?issues:[{severity:'information',code:'informational',details:{text:'Local R4 structural checks passed. Terminology bindings and ABDM profiles are not certified.'}}]};}
  catch(error){if(error instanceof OperationOutcomeError)return error.outcome;throw error;}
}
// Optional configured FHIR server, never enabled by a URL supplied with a report.
export async function validateExternalFhir(resource:unknown){
  const raw=process.env.BODY_OS_FHIR_SERVER;if(!raw)throw new Error('Configure BODY_OS_FHIR_SERVER before requesting external profile validation.');
  const url=new URL(raw);if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw new Error('FHIR server must use HTTPS or loopback HTTP.');
  const input=z.object({resourceType:z.string().regex(/^[A-Za-z]+$/)}).passthrough().parse(resource);
  const client=new MedplumClient({baseUrl:url.toString(),fetch:((target:RequestInfo|URL,options?:RequestInit)=>fetch(target,{...options,signal:AbortSignal.timeout(20000)})) as typeof fetch});
  if(process.env.BODY_OS_FHIR_ACCESS_TOKEN)client.setAccessToken(process.env.BODY_OS_FHIR_ACCESS_TOKEN);
  return client.post(`fhir/R4/${input.resourceType}/$validate`,input);
}
