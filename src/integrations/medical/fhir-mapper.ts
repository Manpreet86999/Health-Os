import { reportBundle, type MedicalReport } from '../../shared/medical.js';
import type { Bundle, DocumentReference } from '@medplum/fhirtypes';
// Add source-document metadata without publishing private storage URLs or original bytes.
export function exportMedicalFhir(report:MedicalReport,patientId:string):Bundle {
  const bundle=reportBundle(report,patientId);
  const document:DocumentReference={resourceType:'DocumentReference',id:`source-${report.id}`.slice(0,64),status:'current',subject:{reference:`urn:health-os:Patient:${patientId}`},date:report.createdAt,description:report.title,content:[{attachment:{contentType:report.original.mime,title:report.original.name,size:report.original.size}}],identifier:[{system:'urn:health-os:sha256',value:report.original.sha256}]};
  return {...bundle,entry:[...(bundle.entry||[]),{fullUrl:`urn:health-os:DocumentReference:${document.id}`,resource:document}]};
}
