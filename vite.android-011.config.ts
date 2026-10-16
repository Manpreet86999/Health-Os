import {defineConfig} from 'vite';
import base from './vite.config';
import path from 'node:path';
export default defineConfig({...base,build:{...base.build,outDir:path.resolve(__dirname,'dist/android-011')}});
