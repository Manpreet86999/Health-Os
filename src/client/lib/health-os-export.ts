export function downloadArtifact(name:string,content:string,type='application/json'){
  const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export const escapeHtml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
export function csvCell(value:unknown){const s=String(value??'');const safe=/^[\s]*[=+@-]/.test(s)?`'${s}`:s;return `"${safe.replace(/"/g,'""')}"`;}
