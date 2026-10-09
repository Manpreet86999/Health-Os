import { useEffect, useState } from 'react';
import { cloudFetch } from './cloud-api';
const changed=()=>window.dispatchEvent(new Event('health-os-visual-changed'));
async function request(entityId:string,method='GET',body?:unknown){const response=await cloudFetch(`/api/visuals/${encodeURIComponent(entityId)}`,{method,body:body?JSON.stringify(body):undefined});const value=await response.json();if(!response.ok)throw new Error(value.error||'Private photo request failed.');return value;}
export async function saveLocalPhoto(entityId:string,data:Blob|string){let dataUrl=data;if(data instanceof Blob)dataUrl=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(data);});await request(entityId,'POST',{dataUrl});changed();}
export async function removeLocalPhoto(entityId:string){await request(entityId,'DELETE');changed();}
export async function copyLocalPhoto(from:string,to:string){await request(to,'POST',{copyFrom:from});changed();}
export function useLocalPhoto(entityId?:string){const [photo,setPhoto]=useState<{id:string;url:string}|null>(null);useEffect(()=>{if(!entityId)return;let alive=true;const read=async()=>{try{const value=await request(entityId);if(alive)setPhoto(value.dataUrl?{id:entityId,url:value.dataUrl}:null);}catch{if(alive)setPhoto(null);}};void read();const timer=setInterval(()=>void read(),12*60000);window.addEventListener('health-os-visual-changed',read);return()=>{alive=false;clearInterval(timer);window.removeEventListener('health-os-visual-changed',read);};},[entityId]);return photo && photo.id===entityId?photo.url:undefined;}
export async function compressVisualPhoto(file:File):Promise<string> {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12*1024*1024)throw new Error('Choose a JPG, PNG or WebP under 12 MB.');
  const bitmap=await createImageBitmap(file);
  try {
    const scale=Math.min(1,640/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const context=canvas.getContext('2d');if(!context)throw new Error('Image processing is unavailable.');
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    for(const quality of [.8,.65,.5,.35]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<245000)return data;}
    throw new Error('Choose a smaller photo.');
  }finally{bitmap.close();}
}
