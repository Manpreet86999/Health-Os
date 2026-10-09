import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

export default defineConfig({
  plugins: [
    react(),
    ...(process.env.HEALTH_OS_BUNDLE_REPORT ? [{ name:'health-os-bundle-report', generateBundle(_options:unknown,bundle:Record<string,any>) {
      const chunks=Object.values(bundle).filter(item=>item.type==='chunk').map(item=>({file:item.fileName,bytes:Buffer.byteLength(item.code),entry:item.isEntry,imports:item.imports,largestModules:Object.entries(item.modules).map(([file,info]:[string,any])=>({file:file.replace(/\\/g,'/').replace(process.cwd().replace(/\\/g,'/')+'/',''),bytes:info.renderedLength})).sort((a,b)=>b.bytes-a.bytes).slice(0,15)}));
      fs.mkdirSync('output/web-build',{recursive:true});fs.writeFileSync('output/web-build/bundle-composition.json',JSON.stringify(chunks,null,2));
    }}] : []),
  ],

  root: path.resolve(__dirname, 'src/client'),

  publicDir: path.resolve(__dirname, 'src/client/public'),

  build: {
    outDir: path.resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
    rollupOptions: {
      input: { app: path.resolve(__dirname, 'src/client/index.html'), telegram: path.resolve(__dirname, 'src/client/telegram.html') },
      output: { manualChunks(id) {
        const modulePath=id.replace(/\\/g,'/');
        if(modulePath.includes('/node_modules/zod/'))return 'validation';
        if(/\/node_modules\/(?:react|react-dom|scheduler|@tanstack)\//.test(modulePath))return 'react-vendor';
      } },
    },
  },

  server: {
    port: 5173,

  },
});
