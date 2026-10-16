import {chromium} from '@playwright/test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const origin='https://health-os-mcp.health-os-manpr-dc3fa7.workers.dev';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();
 page.on('requestfailed',request=>console.log('Browser request failure:',request.failure()?.errorText));
 await page.route('https://chatgpt.com/connector_platform_oauth_redirect**',route=>route.fulfill({body:'Consent cancelled.'}));
 const query=new URLSearchParams({response_type:'code',client_id:'https://chatgpt.com/oauth/client.json',redirect_uri:'https://chatgpt.com/connector_platform_oauth_redirect',scope:'health.read',state:'browser-consent-test',code_challenge:createHash('sha256').update('browser-consent-verifier-01234567890123456789').digest('base64url'),code_challenge_method:'S256',resource:origin+'/mcp'});
 await page.goto(origin+'/authorize?'+query);
 const posted=page.waitForResponse(response=>response.url()===origin+'/authorize'&&response.request().method()==='POST');
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 const response=await posted;
 const requestOrigin=(await response.request().allHeaders()).origin;
 console.log(JSON.stringify({status:response.status(),requestOrigin}));
 assert.equal(requestOrigin,origin,'Browser must send the server origin when submitting the consent form.');
 assert.equal(response.status(),302,'Consent cancellation must return the OAuth redirect.');
 console.log('Live browser OAuth consent submission passed.');
}finally{await browser.close();}
