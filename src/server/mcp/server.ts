import { McpServer } from '@modelcontextprotocol/server';
import { actionDefinitions,retainedActionIds,isRetainedMcpAction, resources, responseSchema, safeError, mcpVersion,describeMcpCapabilities, type ActionId } from '../../shared/mcp-contracts.js';
import {executionClass,cloudSupports} from '../../shared/mcp-execution.js';
export function buildServer(call:(id:ActionId,input:unknown)=>Promise<any>,allowedScopes:string[],auth?:{resourceMetadataUrl:string}){
  const server=new McpServer({name:'health-os',version:mcpVersion},{instructions:'Health OS has seven sections: Today, Train, Recover, Body, Insights, Search and Settings. Nutrition logging is in Recover / Nutrition Totals. HEOS MCP connections and approvals are in Settings / HEOS MCP. Eat, Health, Care and Intelligence pages have been retired. Call the requested read tool for each current-data request. Do not reuse a previous executor or authorization error as current status. CLOUD_UNAVAILABLE is temporary; retry the read. CLOUD_AUTH_REQUIRED needs reconnection with explicit cloud consent or an open compatible device. Never change health records without an explicit user request.'});
  const execute=(id:ActionId,input:unknown)=>{if(id!=='health.get_capabilities')return call(id,input);const data=describeMcpCapabilities(allowedScopes);return Promise.resolve({success:true,data:{...data,tools:data.tools.map(t=>({...t,executionClass:executionClass(t.name as ActionId),cloudSupported:cloudSupports(t.name as ActionId)}))}});};
  for(const [name,def] of Object.entries(actionDefinitions).filter(([id])=>isRetainedMcpAction(id))){
    if(!allowedScopes.includes(def.scope))continue;
    server.registerTool(name,{description:def.description,inputSchema:def.schema,outputSchema:responseSchema,annotations:{readOnlyHint:def.risk==='R0',destructiveHint:false,idempotentHint:true,openWorldHint:false},_meta:{securitySchemes:[{type:'oauth2',scopes:[def.scope]}],risk:def.risk,actionVersion:1,scope:def.scope,timeoutMs:25000,idempotency:def.risk==='R0'?'not_applicable':'required',domain:name.split('.')[0],executionClass:executionClass(name as ActionId),cloudSupported:cloudSupports(name as ActionId)}},async (input:unknown)=>{
      let result;try{result=await execute(name as ActionId,input);}catch(e){result=safeError(e);}
      const needsAuth=auth&&['CLOUD_AUTH_REQUIRED','AUTH_REQUIRED','CLOUD_AUTH_RECONNECT'].includes(result.error?.code);
      return {content:[{type:'text' as const,text:JSON.stringify(result)}],structuredContent:result,isError:!!result.error,...(needsAuth?{_meta:{'mcp/www_authenticate':[`Bearer resource_metadata="${auth.resourceMetadataUrl}", error="invalid_token", error_description="Reconnect HEOS MCP and authorize cloud access for this connection"`]}}:{})};
    });
  }
  for(const [uri,id] of Object.entries(resources)){if(!isRetainedMcpAction(id)||!allowedScopes.includes(actionDefinitions[id].scope))continue;
    server.registerResource(uri,uri,{mimeType:'application/json',description:actionDefinitions[id].description},async()=>{let result;try{result=await execute(id,{});}catch(e){result=safeError(e);}return {contents:[{uri,mimeType:'application/json',text:JSON.stringify(result)}]};});
  }
  return server;
}
