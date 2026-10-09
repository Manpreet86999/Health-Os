import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { personalMcpServer } from './mcp-server.js';
import { WorkerCloud } from './cloud.js';
import { loadWorkerSession } from './credentials.js';
import { verifySupabaseSession } from '../../shared/supabase-auth.js';

async function main(){
  const cloud=new WorkerCloud(loadWorkerSession());await cloud.request('auth/v1/user');
  const user=await verifySupabaseSession(cloud.session.config,cloud.session.accessToken);
  if(user.uid!==cloud.owner)throw new Error('Worker session owner mismatch.');
  const server=personalMcpServer(cloud);
  await server.connect(new StdioServerTransport());
}
main().catch(error=>{console.error((error as Error).message);process.exitCode=1;});
