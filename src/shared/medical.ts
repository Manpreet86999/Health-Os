import { z } from 'zod';
import type { Bundle, DiagnosticReport, Observation, Patient, Organization, Specimen } from '@medplum/fhirtypes';

export const labSchema = z.object({
  id:z.string().regex(/^[A-Za-z0-9.-]{1,64}$/), name:z.string().min(1).max(250), loinc:z.string().regex(/^\d+-\d$/).optional(),
  value:z.number().finite().optional(), valueText:z.string().max(1000).optional(), comparator:z.enum(['<','<=','>','>=']).optional(),
  unit:z.string().max(40).default(''), referenceLow:z.number().finite().optional(), referenceHigh:z.number().finite().optional(),
  referenceText:z.string().max(1000).default(''), laboratory:z.string().max(250).default(''), method:z.string().max(250).default(''),
  specimen:z.string().max(250).default(''), collectedAt:z.string().datetime({offset:true}), sourceLine:z.string().max(2000).default(''),
  sourceFlag:z.string().max(40).default(''),
}).superRefine((r,c)=>{if(r.value===undefined&&!r.valueText)c.addIssue({code:'custom',message:'A result needs a value or text'});if(r.referenceLow!==undefined&&r.referenceHigh!==undefined&&r.referenceLow>r.referenceHigh)c.addIssue({code:'custom',message:'Reference bounds are reversed'});});
export type LabResult = z.infer<typeof labSchema>;
export const reportInputSchema = z.object({title:z.string().min(1).max(250),category:z.enum(['laboratory','radiology','ECG','discharge','other']),collectedAt:z.string().datetime({offset:true}),laboratory:z.string().max(250).default(''),narrative:z.string().max(200000).default(''),results:z.array(labSchema).max(1000)}).superRefine((r,c)=>{if(new Set(r.results.map(v=>v.id)).size!==r.results.length)c.addIssue({code:'custom',message:'Result IDs must be unique'});});
export type MedicalReport = z.infer<typeof reportInputSchema> & {id:string;status:'draft'|'reviewed';createdAt:string;reviewedAt?:string;revision:number;original:{name:string;mime:string;sha256:string;size:number};warnings:string[]};

// A curated starter subset, never a substitute for a licensed terminology server.
export const LAB_TESTS = [
  {name:'Hemoglobin',loinc:'718-7',aliases:['haemoglobin','hemoglobin','hb','hgb'],unit:'g/dL',description:'Hemoglobin carries oxygen in red blood cells.'},
  {name:'WBC',loinc:'6690-2',aliases:['wbc','white blood cells','total leukocyte count'],unit:'10*3/uL',description:'White blood cells are part of the immune system.'},
  {name:'Platelets',loinc:'777-3',aliases:['platelets','platelet count'],unit:'10*3/uL',description:'Platelets contribute to blood clotting.'},
  {name:'MCV',loinc:'787-2',aliases:['mcv'],unit:'fL',description:'MCV measures average red blood cell size.'},
  {name:'Ferritin',loinc:'2276-4',aliases:['ferritin'],unit:'ng/mL',description:'Ferritin helps assess stored iron; inflammation can affect it.'},
  {name:'Iron',loinc:'2498-4',aliases:['iron','serum iron'],unit:'ug/dL',description:'Serum iron measures circulating iron at the time of collection.'},
  {name:'HbA1c',loinc:'4548-4',aliases:['hba1c','glycated hemoglobin'],unit:'%',description:'HbA1c reflects longer term blood glucose exposure.'},
  {name:'Creatinine',loinc:'2160-0',aliases:['creatinine','serum creatinine'],unit:'mg/dL',description:'Creatinine is used with other information to assess kidney filtration.'},
  {name:'ALT',loinc:'1742-6',aliases:['alt','sgpt'],unit:'U/L',description:'ALT is an enzyme assessed in liver investigations.'},
  {name:'AST',loinc:'1920-8',aliases:['ast','sgot'],unit:'U/L',description:'AST is an enzyme found in liver and other tissues.'},
  {name:'TSH',loinc:'3016-3',aliases:['tsh'],unit:'m[IU]/L',description:'TSH helps assess thyroid function alongside other tests.'},
  {name:'Vitamin D',loinc:undefined,aliases:['vitamin d'],unit:'ng/mL',description:'Confirm whether this report measures total 25-hydroxy vitamin D, D3 alone or another form.'},
  {name:'25-hydroxy Vitamin D (total)',loinc:'62292-8',aliases:['25-oh vitamin d','25-hydroxy vitamin d','vitamin d total','25-oh vitamin d total'],unit:'ng/mL',description:'Total 25-hydroxy vitamin D includes D2 and D3 and is used to assess vitamin D status.'},
  {name:'25-hydroxy Vitamin D3',loinc:'1989-3',aliases:['25-oh vitamin d3','25-hydroxy vitamin d3'],unit:'ng/mL',description:'This test measures the D3 component of 25-hydroxy vitamin D.'},
  {name:'Vitamin B12',loinc:'2132-9',aliases:['vitamin b12','b12'],unit:'pg/mL',description:'Vitamin B12 supports blood cell formation and nerve function.'},
  {name:'Glucose',loinc:'2345-7',aliases:['glucose','blood glucose'],unit:'mg/dL',description:'Glucose measures blood sugar at collection; timing matters.'},
  {name:'Total cholesterol',loinc:'2093-3',aliases:['total cholesterol','cholesterol'],unit:'mg/dL',description:'Total cholesterol is one part of a lipid profile.'},
] as const;
export function identifyTest(name:string){const n=name.trim().toLowerCase();return LAB_TESTS.find(t=>t.aliases.some(a=>a===n));}
export function ucum(unit:string){const aliases:Record<string,string>={'µmol/L':'umol/L','μmol/L':'umol/L','µg/dL':'ug/dL','μg/dL':'ug/dL','mIU/L':'m[IU]/L','IU/L':'[IU]/L','°C':'Cel','bpm':'/min','cells/µL':'/uL','10^3/µL':'10*3/uL','10^9/L':'10*9/L','hours':'h'};return aliases[unit]||unit;}
function ucumCoding(unit:string){const code=ucum(unit);return new Set(['g/dL','g/L','mg/dL','mmol/L','umol/L','ug/dL','ng/mL','pg/mL','fL','10*3/uL','10*9/L','/uL','U/L','[IU]/L','m[IU]/L','%','Cel','/min','ms','h','kg','cm','mm[Hg]']).has(code)?{system:'http://unitsofmeasure.org',code}:{};}
export function normalizeLab(r:LabResult):LabResult {
  const unit=ucum(r.unit);let factor=1,target=unit;
  if(r.loinc==='718-7'&&unit==='g/L'){factor=.1;target='g/dL';}
  if(r.loinc==='2160-0'&&unit==='umol/L'){factor=1/88.4;target='mg/dL';}
  if(r.loinc==='2345-7'&&unit==='mmol/L'){factor=18.0182;target='mg/dL';}
  if(['6690-2','777-3'].includes(r.loinc||'')&&unit==='10*9/L')target='10*3/uL';
  return {...r,unit:target,value:r.value===undefined?undefined:r.value*factor,referenceLow:r.referenceLow===undefined?undefined:r.referenceLow*factor,referenceHigh:r.referenceHigh===undefined?undefined:r.referenceHigh*factor};
}
export function rangeFlag(r:LabResult):'low'|'high'|'within'|'unknown'{
  if(r.value===undefined||r.comparator||!r.unit)return 'unknown';
  if(r.referenceLow!==undefined&&r.value<r.referenceLow)return 'low';
  if(r.referenceHigh!==undefined&&r.value>r.referenceHigh)return 'high';
  return r.referenceLow!==undefined&&r.referenceHigh!==undefined?'within':'unknown';
}
export function parseReportText(text:string,collectedAt:string,laboratory='') {
  const results:LabResult[]=[];const unparsed:string[]=[];
  for(const line of text.split(/\r?\n/).filter(v=>v.trim())){
    // Conservative extraction: one row, explicit number, unit and optional numeric interval.
    const m=line.trim().match(/^(.+?)\s*[:|\t ]\s*(<=|>=|<|>)?\s*(-?\d+(?:\.\d+)?)\s+([^\s|]+)(?:\s*[| ]\s*(-?\d+(?:\.\d+)?)\s*[-–]\s*(-?\d+(?:\.\d+)?))?\s*(H|L|High|Low|B|Borderline)?$/i);
    if(!m){unparsed.push(line);continue;}
    const test=identifyTest(m[1]);
    if(!test){unparsed.push(line);continue;}
    results.push(labSchema.parse({id:`result-${results.length+1}`,name:test.name,loinc:test.loinc,value:Number(m[3]),comparator:m[2]||undefined,unit:m[4],referenceLow:m[5]===undefined?undefined:Number(m[5]),referenceHigh:m[6]===undefined?undefined:Number(m[6]),referenceText:m[5]===undefined?'':`${m[5]}–${m[6]} ${m[4]}`,laboratory,collectedAt,sourceLine:line,sourceFlag:m[7]||''}));
  }
  return {results,warnings:[`${unparsed.length} lines retained as narrative, not structured results.`, 'Verify test identity, specimen, values, units, collection date and laboratory ranges against the original.']};
}
export function labTrends(reports:MedicalReport[]) {
  const groups=new Map<string,(LabResult&{reportId:string;reportRevision:number})[]>();
  for(const report of reports.filter(r=>r.status==='reviewed'))for(const raw of report.results){const r=normalizeLab(raw);if(r.value===undefined||r.comparator)continue;const key=`${r.loinc||r.name.toLowerCase()}|${r.unit}|${r.method}|${r.specimen}|${r.laboratory}`;groups.set(key,[...(groups.get(key)||[]),{...r,reportId:report.id,reportRevision:report.revision}]);}
  return [...groups.values()].map(rows=>{rows.sort((a,b)=>Date.parse(a.collectedAt)-Date.parse(b.collectedAt));const latest=rows.at(-1)!;const change=latest.value!-rows[0].value!;return {name:latest.name,unit:latest.unit,points:rows,direction:rows.length<2?'insufficient':change>0?'rising':change<0?'declining':'stable',change,flag:rangeFlag(latest),explanation:`${latest.name} on ${latest.collectedAt.slice(0,10)}: ${latest.value} ${latest.unit}. ${rangeFlag(latest)==='unknown'?'Supplied range cannot be interpreted.':rangeFlag(latest)==='within'?'Within the supplied laboratory range.':`Below or above the supplied laboratory range (${rangeFlag(latest)}).`} ${rows.length} comparable measurements.`,question:`Ask your clinician whether changes in ${latest.name}, symptoms, medication or testing method need follow-up.`};});
}
export function reportBundle(report:MedicalReport,patientId='local-patient'):Bundle {
  const status=report.status==='reviewed'?'final':'preliminary';
  const patient:Patient={resourceType:'Patient',id:patientId};
  const labs=new Map<string,Organization>();
  const labReference=(name:string)=>{
    if(!name)return undefined;
    if(!labs.has(name))labs.set(name,{resourceType:'Organization',id:`lab-${report.id}.${labs.size}`,name});
    return {reference:`urn:health-os:Organization:${labs.get(name)!.id}`};
  };
  const reportLab=labReference(report.laboratory);
  const specimens:Specimen[]=[];
  const observations:Observation[]=report.results.map((r,index)=>{
    const specimen:Specimen|undefined=r.specimen?{resourceType:'Specimen',id:`specimen-${report.id}.${index}`,subject:{reference:`urn:health-os:Patient:${patientId}`},type:{text:r.specimen},collection:{collectedDateTime:r.collectedAt}}:undefined;
    if(specimen)specimens.push(specimen);
    const lab=labReference(r.laboratory||report.laboratory);
    return {resourceType:'Observation',id:`${report.id}.${index}`,status,subject:{reference:`urn:health-os:Patient:${patientId}`},effectiveDateTime:r.collectedAt,
      code:{text:r.name,coding:r.loinc?[{system:'http://loinc.org',code:r.loinc,display:r.name}]:undefined},
      valueQuantity:r.value===undefined?undefined:{value:r.value,comparator:r.comparator,unit:r.unit,...ucumCoding(r.unit)},
      valueString:r.value===undefined?r.valueText:undefined,
      referenceRange:r.referenceLow!==undefined||r.referenceHigh!==undefined||r.referenceText?[{
        low:r.referenceLow===undefined?undefined:{value:r.referenceLow,unit:r.unit,...ucumCoding(r.unit)},
        high:r.referenceHigh===undefined?undefined:{value:r.referenceHigh,unit:r.unit,...ucumCoding(r.unit)},text:r.referenceText}]:undefined,
      method:r.method?{text:r.method}:undefined,performer:lab?[lab]:undefined,specimen:specimen?{reference:`urn:health-os:Specimen:${specimen.id}`}:undefined,
      interpretation:r.sourceFlag?[{text:r.sourceFlag,coding:['H','L','N','HH','LL','A'].includes(r.sourceFlag)?[{system:'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',code:r.sourceFlag}]:undefined}]:undefined,
      note:r.sourceLine?[{text:r.sourceLine}]:undefined};
  });
  const diagnostic:DiagnosticReport={resourceType:'DiagnosticReport',id:report.id,meta:{versionId:String(report.revision)},status,code:{text:report.title},subject:{reference:`urn:health-os:Patient:${patientId}`},effectiveDateTime:report.collectedAt,performer:reportLab?[reportLab]:undefined,result:observations.map(r=>({reference:`urn:health-os:Observation:${r.id}`})),conclusion:report.narrative,presentedForm:[{contentType:report.original.mime,title:report.original.name}]};
  return {resourceType:'Bundle',type:'collection',entry:[patient,diagnostic,...observations,...labs.values(),...specimens].map(resource=>({fullUrl:`urn:health-os:${resource.resourceType}:${resource.id}`,resource}))};
}
