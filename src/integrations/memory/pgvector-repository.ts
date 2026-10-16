import { z } from 'zod';
export const memoryInputSchema = z.object({summary:z.string().trim().min(1).max(1000),domain:z.enum(['general','train','nutri','recover','body','care']),sourceId:z.string().max(200).default('user-authored'),confidence:z.number().min(0).max(1).default(1)});
export type MemoryInput=z.infer<typeof memoryInputSchema>;
export interface MemoryEvidence {id:string;summary:string;domain:string;source_id:string;confidence:number;similarity?:number;created_at:string;}
export type MemoryTransport=(action:Record<string,unknown>)=>Promise<any>;
export class MemoryRepository {
  constructor(private request:MemoryTransport){}
  async remember(input:MemoryInput):Promise<MemoryEvidence> {return this.request({action:'remember',...memoryInputSchema.parse(input)});}
  async list():Promise<MemoryEvidence[]> {return this.request({action:'list'});}
  async retrieve(query:string,domain:string):Promise<MemoryEvidence[]> {return this.request({action:'retrieve',query:query.slice(0,1000),domain});}
  async forget(id:string):Promise<void> {await this.request({action:'forget',id:z.string().uuid().parse(id)});}
  async reset():Promise<void> {await this.request({action:'reset'});}
}
