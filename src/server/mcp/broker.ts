import { DatabaseSync } from 'node:sqlite';
import { BrokerCore } from './broker-core.js';
export { clientInput, type Principal } from './broker-core.js';
export class Broker extends BrokerCore {
  constructor(file:string,policy={enabled:true,writeEnabled:true}){
    const db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    super(db,policy);
  }
}