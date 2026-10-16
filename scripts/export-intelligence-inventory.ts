import {mkdir,writeFile} from 'node:fs/promises';
import {z} from 'zod';
import {actionDefinitions} from '../src/shared/mcp-contracts.js';
import {executionClass} from '../src/shared/mcp-execution.js';
import {permittedTools} from '../src/shared/intelligence/agent-tools.js';
import {chatDomains} from '../src/shared/intelligence-chat.js';
const actions=Object.entries(actionDefinitions).map(([id,definition])=>({id,scope:definition.scope,risk:definition.risk,description:definition.description,executor:executionClass(id as keyof typeof actionDefinitions),schema:z.toJSONSchema(definition.schema)}));
const agentReads=permittedTools({mode:'auto',domains:[...chatDomains],recordIds:[],date:'2026-10-13',research:'deep'});
await mkdir('output/intelligence-upgrade-evidence',{recursive:true});await writeFile('output/intelligence-upgrade-evidence/canonical-inventory.json',JSON.stringify({asOf:new Date().toISOString(),actions,agentReads},null,2));console.log(JSON.stringify({canonicalActions:actions.length,agentReads:Object.keys(agentReads).length,output:'output/intelligence-upgrade-evidence/canonical-inventory.json'}));
