import { Modal } from './Modal';
import { navigation, sections } from '../lib/os-navigation';
import type { Page } from '../lib/types';
import { OSIcon } from './OSIcon';
import { useState } from 'react';

export function AllPages({ open, onClose, choose }: { open: boolean; onClose: () => void; choose: (page: Page, panel?: string) => void }) {
  const [query,setQuery]=useState('');
  const groups=sections.map(section=>({...section,items:navigation[section.name].filter(item=>`${section.name} ${item.label}`.toLowerCase().includes(query.trim().toLowerCase()))})).filter(section=>section.items.length);
  return <Modal open={open} title="All pages" onClose={onClose} className="os-all-pages"><p className="subtle">All your training, care and tracking screens, organized by domain.</p><input className="input" aria-label="Find a page" placeholder="Find a page…" value={query} onChange={e=>setQuery(e.target.value)} style={{marginBottom:24}}/>{!groups.length&&<p className="subtle">No pages match. Try a domain or page name.</p>}<div className="os-page-directory">{groups.map(section=><section key={section.name}><h4><OSIcon name={section.name} size={18}/>{section.name}</h4>{section.items.map((item,i)=><button key={i} onClick={()=>{choose(item.page,item.panel);onClose();setQuery('');}}>{item.label}<span aria-hidden="true">↗</span></button>)}</section>)}</div></Modal>;
}
