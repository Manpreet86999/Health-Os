import {mergeConfig} from 'vite';
import base from './vite.config';
// Keep the module graph consistent while other workspace jobs edit files.
// Acceptance is a bounded run; restart its server to validate further changes.
export default mergeConfig(base,{server:{hmr:false,watch:null}});
