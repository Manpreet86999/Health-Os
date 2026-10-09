import { gcm } from '@noble/ciphers/aes';
import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';
import type { EncryptedVaultEnvelope } from './sync.js';

const encoder=new TextEncoder(),decoder=new TextDecoder(),ITERATIONS=310_000,alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toBase64(value:Uint8Array){let result='';for(let index=0;index<value.length;index+=3){const chunk=(value[index]<<16)|((value[index+1]||0)<<8)|(value[index+2]||0);result+=alphabet[(chunk>>18)&63]+alphabet[(chunk>>12)&63]+(index+1<value.length?alphabet[(chunk>>6)&63]:'=')+(index+2<value.length?alphabet[chunk&63]:'=');}return result;}
function fromBase64(value:string){const clean=value.replace(/\s/g,'').replace(/=+$/,'');const output=new Uint8Array(Math.floor(clean.length*6/8));let buffer=0,bits=0,offset=0;for(const char of clean){const digit=alphabet.indexOf(char);if(digit<0)throw new Error('Invalid base64');buffer=(buffer<<6)|digit;bits+=6;if(bits>=8){bits-=8;output[offset++]=(buffer>>bits)&255;}}return output;}
function defaultRandom(length:number){const value=new Uint8Array(length);globalThis.crypto.getRandomValues(value);return value;}
async function wrappingKey(passphrase:string,salt:Uint8Array,iterations:number){if(passphrase.length<10)throw new Error('Vault passphrase must contain at least 10 characters.');return pbkdf2Async(sha256,encoder.encode(passphrase),salt,{c:iterations,dkLen:32,asyncTick:10});}
export async function encryptVault(values:Record<string,string>,passphrase:string,randomBytes:(length:number)=>Uint8Array=defaultRandom):Promise<EncryptedVaultEnvelope>{
  const salt=randomBytes(16),wrapIv=randomBytes(12),dataIv=randomBytes(12),vaultKey=randomBytes(32),wrapKey=await wrappingKey(passphrase,salt,ITERATIONS);
  const wrappedKey=gcm(wrapKey,wrapIv).encrypt(vaultKey),ciphertext=gcm(vaultKey,dataIv).encrypt(encoder.encode(JSON.stringify(values)));
  return {version:1,algorithm:'AES-GCM',kdf:'PBKDF2-SHA256',iterations:ITERATIONS,salt:toBase64(salt),wrapIv:toBase64(wrapIv),wrappedKey:toBase64(wrappedKey),dataIv:toBase64(dataIv),ciphertext:toBase64(ciphertext),updatedAt:new Date().toISOString()};
}
export async function decryptVault(envelope:EncryptedVaultEnvelope,passphrase:string):Promise<Record<string,string>>{
  if(envelope.version!==1||envelope.algorithm!=='AES-GCM'||envelope.kdf!=='PBKDF2-SHA256'||envelope.iterations<210_000)throw new Error('Unsupported or unsafe credential vault.');
  try{const wrapKey=await wrappingKey(passphrase,fromBase64(envelope.salt),envelope.iterations),vaultKey=gcm(wrapKey,fromBase64(envelope.wrapIv)).decrypt(fromBase64(envelope.wrappedKey)),plaintext=gcm(vaultKey,fromBase64(envelope.dataIv)).decrypt(fromBase64(envelope.ciphertext)),parsed=JSON.parse(decoder.decode(plaintext));if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||Object.values(parsed).some(value=>typeof value!=='string'))throw new Error('Invalid vault contents.');return parsed as Record<string,string>;}catch{throw new Error('The vault passphrase is incorrect or the encrypted data is damaged.');}
}
