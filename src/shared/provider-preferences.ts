/** Public client/cache view of provider configuration; values stay on the server. */
export function publicProviderPreferences(input:Record<string,unknown>):Record<string,unknown>{
 const output={...input},nvidia=input.aiProvider==='nvidia';
 const existing=typeof input.openRouterApiKey==='string'&&input.openRouterApiKey?input.openRouterApiKey:!nvidia&&typeof input.aiApiKey==='string'?input.aiApiKey:undefined;
 delete output.openRouterApiKey;
 for(const field of ['aiApiKey','apiKey','providerApiKey','openrouterKey'])if(!nvidia||existing&&input[field]===existing||typeof input[field]==='string'&&(input[field] as string).startsWith('sk-or-')||field==='openrouterKey')delete output[field];
 if(existing&&input.nvidiaNimApiKey===existing||typeof input.nvidiaNimApiKey==='string'&&input.nvidiaNimApiKey.startsWith('sk-or-'))delete output.nvidiaNimApiKey;
 if(existing)output.hasOpenRouterApiKey=true;
 return output;
}
