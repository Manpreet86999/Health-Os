import { Library, Executor } from 'cql-execution';
import { PatientSource } from 'cql-exec-fhir';
import type { Bundle } from '@medplum/fhirtypes';

// Trusted, bundled ELM only. No executable user-supplied rule uploads.
const reportCountElm={library:{identifier:{id:'HealthOSRecordInventory',version:'1.0.0'},schemaIdentifier:{id:'urn:hl7-org:elm',version:'r1'},usings:{def:[{localIdentifier:'System',uri:'urn:hl7-org:elm-types:r1'},{localIdentifier:'FHIR',uri:'http://hl7.org/fhir',version:'4.0.1'}]},contexts:{def:[{name:'Patient'}]},statements:{def:[{name:'ObservationCount',context:'Patient',accessLevel:'Public',expression:{type:'Count',source:{type:'Retrieve',dataType:'{http://hl7.org/fhir}Observation'}}}]}}};
export async function executeRecordInventory(bundle:Bundle){const source=PatientSource.FHIRv401();source.loadBundles([bundle]);const result=await new Executor(new Library(reportCountElm)).exec(source);return {library:'HealthOSRecordInventory',version:'1.0.0',status:'educational',patientResults:result.patientResults};}
