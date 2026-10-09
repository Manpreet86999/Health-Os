import { memo, useState, type CSSProperties } from 'react';
import { resolveVisual, type VisualContext } from '../lib/visual-assets';
import { compressVisualPhoto, removeLocalPhoto, saveLocalPhoto, useLocalPhoto } from '../lib/local-visuals';
import { OSIcon } from './OSIcon';

export const HealthOsImage=memo(function HealthOsImage({context,alt,variant='thumbnail',className='',priority=false,fit='cover',decorative=false}:{context:VisualContext;alt?:string;variant?:'thumbnail'|'cover'|'hero';className?:string;priority?:boolean;fit?:'cover'|'contain';decorative?:boolean}) {
  const local=useLocalPhoto(context.entityId),visual=resolveVisual({...context,userImage:local||context.userImage});
  const signature=visual.candidates.map(c=>c.src).join('|');
  return <ImageChain key={signature} visual={visual} alt={alt||context.name||context.entityType} variant={variant} className={className} priority={priority} fit={fit} decorative={decorative}/>;
});
function ImageChain({visual,alt,variant,className,priority,fit,decorative}:{visual:ReturnType<typeof resolveVisual>;alt:string;variant:string;className:string;priority:boolean;fit:string;decorative:boolean}) {
  const [index,setIndex]=useState(0),[loaded,setLoaded]=useState(false),candidate=visual.candidates[index];
  const description=candidate?.origin==='curated'||candidate?.origin==='fallback'?`${alt} · ${candidate.description}`:alt;
  return <span className={`health-os-image visual-${variant} ${className}`} data-category={visual.category} data-source={candidate?.origin||'icon'} data-loaded={loaded} style={{'--image-fit':fit} as CSSProperties} role={!candidate&&!decorative?'img':undefined} aria-label={!candidate&&!decorative?alt:undefined} aria-hidden={decorative||undefined}>
    <span className="visual-image-placeholder" aria-hidden="true"><OSIcon name={visual.icon} size={variant==='thumbnail'?24:44}/></span>
    {candidate&&<img key={candidate.src} src={candidate.src} srcSet={candidate.srcSet} sizes={variant==='thumbnail'?'(max-width: 600px) 72px, 120px':'(max-width: 600px) 100vw, 640px'} alt={decorative?'':description} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':'auto'} decoding="async" width={variant==='thumbnail'?160:640} height={variant==='thumbnail'?160:400} onLoad={()=>setLoaded(true)} onError={()=>{setLoaded(false);setIndex(i=>i+1);}}/>}
  </span>;
}

export function PersonalPhotoControl({entityId,label='photo'}:{entityId:string;label?:string}) {
  const photo=useLocalPhoto(entityId),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <div className="personal-photo-control"><label className="btn btn-soft btn-sm">{busy?'Saving…':photo?`Replace ${label}`:`Add ${label}`}<input type="file" accept="image/jpeg,image/png,image/webp" className="visual-file-input" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;setBusy(true);setError('');try{await saveLocalPhoto(entityId,await compressVisualPhoto(file));}catch(error){setError((error as Error).message);}finally{setBusy(false);}}}/></label>{photo&&<button type="button" className="btn btn-soft btn-sm" onClick={()=>void removeLocalPhoto(entityId).catch(error=>setError(error.message))}>Remove {label}</button>}<small>Private · your private cloud account</small>{error&&<p role="alert">{error}</p>}</div>;
}
