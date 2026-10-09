import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import path from 'node:path';
const scratch=path.resolve('scratch');mkdirSync(scratch,{recursive:true});
const root=mkdtempSync(path.join(scratch,'unit-'));
const result=spawnSync(process.execPath,['--import','tsx','--test','--test-concurrency=2','src/server/*.test.ts','src/server/services/*.test.ts','src/server/db/*.test.ts','src/shared/*.test.ts','supabase/tests/*.test.ts'],{
  stdio:'inherit',env:{...process.env,TSX_TSCONFIG_PATH:'tsconfig.server.json',BODY_OS_DATA_DIR:path.join(root,'data'),BODY_OS_BACKUP_DIR:path.join(root,'backups')},
});
process.exit(result.status??1);
