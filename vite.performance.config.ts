import {mergeConfig} from 'vite';
import path from 'node:path';
import base from './vite.config';
// Keep acceptance assets stable while other workspace jobs build dist/client.
export default mergeConfig(base,{build:{outDir:path.resolve(__dirname,'outputs/ux-acceptance/production')}});
