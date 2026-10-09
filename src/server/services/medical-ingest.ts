import { z } from 'zod';
import path from 'node:path';
import fs from 'node:fs';
import { DATA_DIR } from '../config.js';
import { validateLocalFhir } from './medical-standards.js';
import type { Bundle, Observation, DiagnosticReport, Organization, Specimen } from '@medplum/fhirtypes';
import { labSchema, parseReportText, type LabResult } from '../../shared/medical.js';

export const importMedicalSchema=z.object({name:z.string().min(1).max(250),mime:z.enum(['text/plain','application/pdf','image/png','image/jpeg','image/webp','application/fhir+json','application/json','application/dicom']),base64:z.string().min(1).max(8000000).regex(/^[A-Za-z0-9+/]+={0,2}$/),collectedAt:z.string().datetime({offset:true}),laboratory:z.string().max(250).default('')});
export function fhirReport(bytes:Buffer,fallbackDate:string){
  const envelope=z.object({resourceType:z.literal('Bundle'),type:z.string(),entry:z.array(z.object({fullUrl:z.string().optional(),resource:z.object({resourceType:z.string()}).passthrough()})).max(2000)}).parse(JSON.parse(bytes.toString('utf8')));
  const bundle=envelope as unknown as Bundle;
  const structural=validateLocalFhir(bundle);if(structural.issue?.some(i=>i.severity==='error'||i.severity==='fatal'))throw new Error('FHIR R4 structure validation failed. Correct the source bundle before importing.');
  const resources=bundle.entry!.map(e=>e.resource!);
  const reports=resources.filter(r=>r.resourceType==='DiagnosticReport') as DiagnosticReport[];
  if(reports.length!==1)throw new Error('Import one DiagnosticReport per FHIR Bundle.');
  const report=reports[0];if(!['final','amended','corrected','appended'].includes(report.status))throw new Error('FHIR report must be final, amended or corrected.');
  const subject=report.subject?.reference;if(!subject)throw new Error('FHIR report needs an explicit patient subject.');
  const patients=resources.filter(r=>r.resourceType==='Patient');if(patients.length>1)throw new Error('Multi-patient imports are not supported.');
  const results:LabResult[]=[];
  const resolve=(reference:string|undefined)=>bundle.entry!.find(e=>reference&&(reference===e.fullUrl||reference===`${e.resource?.resourceType}/${e.resource?.id}`))?.resource;
  if(patients.length===1&&resolve(subject)!==patients[0])throw new Error('Report patient reference does not match the included patient.');
  for(const ref of report.result||[]){
    const entry=bundle.entry!.find(e=>ref.reference===e.fullUrl||ref.reference===`${e.resource?.resourceType}/${e.resource?.id}`);
    if(!entry||entry.resource?.resourceType!=='Observation')throw new Error('DiagnosticReport contains an unresolved Observation reference.');
    const o=entry.resource as Observation;if(o.subject?.reference!==subject)throw new Error('Observation belongs to a different or unknown patient.');
    if(!['final','amended','corrected'].includes(o.status))throw new Error('Only final observations can be imported.');
    const range=o.referenceRange?.[0],q=o.valueQuantity;
    const specimenResource=resolve(o.specimen?.reference);const specimen=specimenResource?.resourceType==='Specimen'?specimenResource as Specimen:undefined;
    if(specimen?.subject?.reference&&specimen.subject.reference!==subject)throw new Error('Specimen belongs to a different patient.');
    if((o.referenceRange?.length||0)>1)throw new Error('Multiple reference intervals require selecting the applicable interval in the source before structured import.');
    const labResource=resolve(o.performer?.[0]?.reference||report.performer?.[0]?.reference);const laboratory=labResource?.resourceType==='Organization'?(labResource as Organization).name||'':'';
    if(range?.low?.unit&&range.low.unit!==q?.unit||range?.high?.unit&&range.high.unit!==q?.unit)throw new Error('Reference range units differ from the result; review externally before importing.');
    results.push(labSchema.parse({id:`result-${results.length+1}`,name:o.code.text||o.code.coding?.[0]?.display||'Unmapped result',loinc:o.code.coding?.find(c=>c.system==='http://loinc.org')?.code,value:q?.value,valueText:o.valueString||o.valueCodeableConcept?.text,comparator:q?.comparator,unit:q?.code||q?.unit||'',referenceLow:range?.low?.value,referenceHigh:range?.high?.value,referenceText:range?.text||'',collectedAt:specimen?.collection?.collectedDateTime||o.effectiveDateTime||report.effectiveDateTime||fallbackDate,method:o.method?.text||'',laboratory,specimen:specimen?.type?.text||'',sourceFlag:o.interpretation?.[0]?.text||o.interpretation?.[0]?.coding?.[0]?.code||'',sourceLine:o.note?.map(n=>n.text).join('\n')||''}));
  }
  return {title:report.code.text||report.code.coding?.[0]?.display||'Imported FHIR report',category:report.category?.some(c=>c.coding?.some(v=>v.code==='RAD'))?'radiology' as const:'laboratory' as const,collectedAt:report.effectiveDateTime||fallbackDate,narrative:report.conclusion||'',results,warnings:['Confirm the imported patient identity against the original FHIR document.','FHIR structure checks are local checks, not ABDM profile certification.']};
}
export async function extractMedical(input:z.infer<typeof importMedicalSchema>){
  const bytes=Buffer.from(input.base64,'base64');if(bytes.length>6_000_000)throw new Error('Maximum report size is 6 MB.');
  if(input.mime==='application/fhir+json'||input.mime==='application/json')return {bytes,...fhirReport(bytes,input.collectedAt)};
  let text='',warnings:string[]=[];
  if(input.mime==='text/plain')text=bytes.toString('utf8');
  else if(input.mime==='application/pdf'){
    if(!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error('File is not a PDF.');
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:true});
    try {const pdf=await task.promise;if(pdf.numPages>50)throw new Error('Maximum PDF length is 50 pages.');
      for(let p=1;p<=pdf.numPages;p++){const page=await pdf.getPage(p);const content=await page.getTextContent();let previousY:number|undefined;for(const item of content.items){if(!('str' in item))continue;const y=item.transform[5];text+=(previousY!==undefined&&Math.abs(y-previousY)>3?'\n':' ')+item.str;previousY=y;}text+='\n';page.cleanup();}
      if(!text.trim())warnings.push('This PDF is scanned. Upload page images for OCR or paste the report text.');
    }finally{await task.destroy();}
  } else if(input.mime==='application/dicom'){
    const {default:dcmjs}=await import('dcmjs');const array=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);const dicom=dcmjs.data.DicomMessage.readFile(array);const tags=dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicom.dict);text=`DICOM metadata\nModality: ${tags.Modality||'Unknown'}\nStudy: ${tags.StudyDescription||'Unknown'}\nStudy date: ${tags.StudyDate||'Unknown'}`;warnings.push('Metadata only. Raw medical images have not been interpreted.');
  } else {
    const valid=input.mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):input.mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';if(!valid)throw new Error('Image content does not match its file type.');
    const cachePath=path.join(DATA_DIR,'medical-ocr');fs.mkdirSync(cachePath,{recursive:true});
    const {createWorker}=await import('tesseract.js');const worker=await createWorker('eng',undefined,{cachePath});try{const result=await worker.recognize(bytes);text=result.data.text;warnings.push(`OCR confidence ${result.data.confidence.toFixed(0)}%. All values require review.`);}finally{await worker.terminate();}
  }
  if(text.length>200000)throw new Error('Extracted text is too large.');
  const parsed=parseReportText(text,input.collectedAt,input.laboratory);
  const category=/radiology|impression|mri|x-ray|ultrasound|DICOM metadata/i.test(text)?'radiology' as const:/discharge/i.test(text)?'discharge' as const:/electrocardiogram|\bECG\b/i.test(text)?'ECG' as const:parsed.results.length?'laboratory' as const:'other' as const;
  return {bytes,title:input.name,category,collectedAt:input.collectedAt,laboratory:input.laboratory,narrative:text,results:parsed.results,warnings:[...warnings,...parsed.warnings]};
}
