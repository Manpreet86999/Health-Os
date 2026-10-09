import { TextAreaField } from '../../components/TextAreaField';
import { useDraftState, useDraftFields } from '../../lib/use-draft';
import { DraftFeedback } from '../../components/DraftFeedback';
import { HealthOsImage, PersonalPhotoControl } from '../../components/HealthOsImage';
import { useState, type FormEvent } from 'react';
import { EmptyState } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { useApp } from '../../state/AppContext';
import { useToast } from '../../components/Toast';
import {
  CATEGORY_LABEL,
  PRODUCT_CATEGORIES,
  SKIN_PRODUCT_TEMPLATE,
  type ProductCategory,
  type ProductStatus,
} from '../../../shared/skin';

type WebProductDraft = {
  name: string;
  brand: string;
  category: ProductCategory;
  actives: string;
  useCase: string;
  bestFor: string;
  sourceUrl: string;
  status: ProductStatus;
};

export function SkinProducts({researchOnly=false}:{researchOnly?:boolean}) {
  const app = useApp();
  const toast = useToast();
  const { skin, refreshSkin, settings } = app;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'one' | 'json'>('one');
  const [busy, setBusy] = useState(false);
  const [jsonText, setJsonText] = useState('');  const [webOpen, setWebOpen] = useState(false);
  const [labelConsent, setLabelConsent] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [webBusy, setWebBusy] = useState(false);
  const [webResult, setWebResult] = useState<{
    answer?: string;
    error?: string;
    sources: Array<{ title: string; url: string; content: string }>;
    proposal?: { name: string; brand: string; category: ProductCategory; actives: string[]; useCase: string; bestFor: string[]; sourceUrl: string; sourceExcerpt?: string };
  } | null>(null);
  const [webDraft, setWebDraft] = useState<WebProductDraft | null>(null);
  const existingWebProduct = webDraft?.sourceUrl
    ? skin.products.find(product => product.sourceUrl && sameProductPage(product.sourceUrl, webDraft.sourceUrl))
    : undefined;
  const productDraft=useDraftState('care-product:new',()=>({id:crypto.randomUUID(),
    name: '',
    brand: '',
    category: 'cleanser' as ProductCategory,
    actives: '',
    pros: '',
    cons: '',
    useCase: '',
    bestFor: '',
    usedInAm: false,
    usedInPm: false,
  }));
  const {value:form,setValue:setForm}=productDraft;

  async function addOne(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return toast.push('Name the product', 'err');
    setBusy(true);
    try {
      await app.api.saveSkinProduct({
        id:form.id,
        name: form.name.trim(),
        brand: form.brand.trim(),
        category: form.category,
        actives: split(form.actives),
        usedIn: [form.usedInAm ? 'am' : null, form.usedInPm ? 'pm' : null].filter(Boolean) as Array<'am' | 'pm'>,
        status: 'active',
        notes: '',
        pros: split(form.pros),
        cons: split(form.cons),
        useCase: form.useCase.trim(),
        bestFor: split(form.bestFor),
        openedAt: '',
        expiresAt: '',
      });
      await refreshSkin();
      setForm({ id:crypto.randomUUID(),name: '', brand: '', category: 'cleanser', actives: '', pros: '', cons: '', useCase: '', bestFor: '', usedInAm: false, usedInPm: false });
      await productDraft.clear();
      setOpen(false);
      toast.push('Added', 'ok');
    } catch (err) {
      toast.push((err as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }

  async function searchWebProduct() {
    if (!productQuery.trim()) return toast.push('Enter a product name to search', 'err');
    setWebBusy(true);
    setWebResult(null);
    setWebDraft(null);
    try {
      const result = await app.api.searchSkinProduct(productQuery.trim());
      if (!result.ok) throw new Error(result.error || 'Product search failed.');
      const sources = result.sources || [];
      setWebResult({ sources, proposal: result.proposal, answer: result.answer, error: result.error });
      setWebDraft({
        name: result.proposal?.name || (/^https?:\/\//i.test(productQuery.trim()) ? '' : productQuery.trim()),
        brand: result.proposal?.brand || '',
        category: result.proposal?.category || 'other',
        actives: result.proposal?.actives.join(', ') || '',
        useCase: result.proposal?.useCase || '',
        bestFor: result.proposal?.bestFor.join(', ') || '',
        sourceUrl: result.proposal?.sourceUrl || (/^https?:\/\//i.test(productQuery.trim()) ? sources[0]?.url || '' : ''),
        status: 'wishlist',
      });
    } catch (error) {
      toast.push((error as Error).message, 'err');
    } finally {
      setWebBusy(false);
    }
  }

  async function readLabel(file: File) {
    if (!labelConsent) return toast.push('Choose the image-sharing consent checkbox first.', 'err');
    setWebBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve,reject) => {
        const image=new Image(); const url=URL.createObjectURL(file);
        image.onload=()=>{const canvas=document.createElement('canvas');const scale=Math.min(1,640/Math.max(image.width,image.height));canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const context=canvas.getContext('2d');if(!context){URL.revokeObjectURL(url);reject(new Error('Image processing unavailable'));return;}context.drawImage(image,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);for(const quality of [.7,.55,.4,.25]){const data=canvas.toDataURL('image/jpeg',quality);if(data.length<245000){resolve(data);return;}}reject(new Error('Image is too large after compression.'));};
        image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Could not read image'));};image.src=url;
      });
      const result=await app.api.readSkinProductLabel(dataUrl,true);
      setWebResult({sources:[],proposal:result.proposal});
      setWebDraft({name:result.proposal.name,brand:result.proposal.brand,category:result.proposal.category,actives:result.proposal.actives.join(', '),useCase:result.proposal.useCase,bestFor:result.proposal.bestFor.join(', '),sourceUrl:'',status:'wishlist'});
      toast.push('Review the extracted label before adding','info');
    } catch(error){toast.push((error as Error).message,'err');}
    finally{setWebBusy(false);}
  }

  async function addWebProposal() {
    const draft = webDraft;
    if (!draft) return;
    if (!draft.name.trim()) return toast.push('Enter the exact product name before adding.', 'err');
    if (existingWebProduct) return toast.push('This product is already on your shelf.', 'info');
    const source = webResult?.sources.find(item => item.url === draft.sourceUrl);
    setWebBusy(true);
    try {
      await app.api.saveSkinProduct({
        name: draft.name.trim(),
        brand: draft.brand.trim(),
        category: draft.category,
        actives: split(draft.actives),
        usedIn: [],
        status: draft.status,
        openedAt: '',
        expiresAt: '',
        notes: '',
        sourceUrl: source?.url || '',
        sourceExcerpt: source?.content.slice(0, 350) || '',
        researchedAt: source ? new Date().toISOString() : '',
        pros: [],
        cons: [],
        useCase: draft.useCase.trim(),
        bestFor: split(draft.bestFor),
      });
      await refreshSkin();
      setWebOpen(false);
      setWebResult(null);
      setWebDraft(null);
      setProductQuery('');
      toast.push('Product added to your shelf', 'ok');
    } catch (error) {
      toast.push((error as Error).message, 'err');
    } finally {
      setWebBusy(false);
    }
  }
  function downloadTemplate() {
    const blob = new Blob([JSON.stringify(SKIN_PRODUCT_TEMPLATE, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'body-os-products-template.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJson() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return toast.push('JSON is not valid', 'err');
    }
    setBusy(true);
    try {
      const res = await app.api.importSkinProducts(parsed);
      await refreshSkin();
      toast.push(`Imported ${res.imported}, skipped ${res.skipped}`, res.imported ? 'ok' : 'info');
      if (res.imported) {
        setOpen(false);
        setJsonText('');
      }
    } catch (e) {
      toast.push((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | null) {
    if (!file) return;
    setJsonText(await file.text());
  }

  async function remove(id: string) {
    await app.api.deleteSkinProduct(id);
    await refreshSkin();
  }

  return (
    <div className="fade page-shell skin-os">
      <header className="page-hero">
        <div>
          <span className="page-eyebrow">Care</span>
          <h1 className="page-title">{researchOnly?'Care research':'My Products'}</h1>
          <p className="page-sub">{researchOnly?'Check the exact product, ingredients and source before adding anything to your shelf.':'Products you own or are considering, with notes and source links. Add them to your Care Plan when they fit your goals.'}</p>
        </div>
        <button type="button" className="btn btn-soft btn-sm" onClick={() => setWebOpen(true)}>
          Search web product
        </button>        <button type="button" className="btn btn-hot" onClick={() => setOpen(true)} aria-label="Add products">Add product
        </button>
      </header>

      {researchOnly ? <section className="card stack"><h2>Start with a product or ingredient</h2><p className="subtle">Search a product name or paste its source link. Review the evidence and exact formula; adding to your shelf always requires your confirmation.</p><button className="btn btn-hot" onClick={()=>setWebOpen(true)}>Research a product</button><button className="btn btn-soft" onClick={()=>app.setPage('SkinProducts')}>Open my product shelf</button></section> : skin.products.length ? (
        <div className="stack">
          {skin.products.map((p) => (
            <article key={p.id} className="card skin-product-card" style={{ alignItems: 'flex-start' }}><HealthOsImage context={{entityType:'product',entityId:p.id,name:p.name,category:p.category}} alt={p.name} fit="contain"/>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="page-eyebrow" style={{ margin: 0 }}>
                  {CATEGORY_LABEL[p.category] || p.category}
                </p>
                <h3 style={{ margin: '4px 0 0' }}>{p.name}</h3>
                <p className="subtle" style={{ margin: '4px 0 0' }}>
                  {[p.brand, p.usedIn.map((s) => s.toUpperCase()).join('/'), p.actives.join(', ')].filter(Boolean).join(' · ')}
                </p>
                <details className="skin-product-details"><summary>Usage, ingredients & research</summary>
                  <div><b>Use case</b><span>{p.useCase || 'Add the job this product does so the coach can place it correctly.'}</span></div>
                  <div><b>Best for</b><span>{p.bestFor?.length ? p.bestFor.join(' · ') : 'Not specified'}</span></div>
                  <div><b>Pros</b><span>{p.pros?.length ? p.pros.join(' · ') : 'Not specified'}</span></div>
                  <div><b>Cons / cautions</b><span>{p.cons?.length ? p.cons.join(' · ') : 'Not specified'}</span></div>
                  {p.sourceUrl && <div><b>Research source</b><a href={p.sourceUrl} target="_blank" rel="noreferrer">Open website</a>{p.sourceExcerpt&&<span>{p.sourceExcerpt}</span>}</div>}
                </details><PersonalPhotoControl entityId={p.id} label="product photo"/>
              </div>
              <div className="stack"><label className="subtle">Status<select className="input" aria-label={`Status for ${p.name}`} value={p.status} onChange={async event=>{try{await app.api.saveSkinProduct({...p,status:event.target.value as typeof p.status});await refreshSkin();toast.push('Product status saved','ok');}catch(error){toast.push((error as Error).message,'err');}}}><option value="active">Using</option><option value="paused">Paused</option><option value="finished">Finished</option><option value="wishlist">Considering</option></select></label><button type="button" className="btn btn-soft btn-sm" onClick={() => void remove(p.id)}>Remove</button></div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nothing on the shelf"
          body="Tap + to add one product or import a JSON list. Then ask the coach to build your routine."
          action={
            <button type="button" className="btn btn-hot" onClick={() => setOpen(true)}>
              Add products
            </button>
          }
        />
      )}

      <Modal
        open={webOpen}
        title="Find a product"
        onClose={() => { setWebOpen(false); setWebResult(null); setWebDraft(null); }}
        actions={webDraft ? (
          <button type="button" className="btn btn-hot" disabled={webBusy || !webDraft.name.trim() || Boolean(existingWebProduct)} onClick={() => void addWebProposal()}>
            {existingWebProduct ? 'Already on shelf' : webBusy ? 'Adding...' : 'Add to shelf'}
          </button>
        ) : undefined}
      >
        <div className="stack">
          <p className="subtle" style={{ margin: 0 }}>
            Search by product name or paste an Amazon or other HTTPS product link. For a link, Health OS tries to read that exact page through Tavily. If it cannot, open the link and fill the details yourself. Check the exact variant before adding it.
          </p>
          {!settings?.hasTavilyApiKey ? <p className="subtle">Add a Tavily API key in Settings before searching. You can also use + to add a product manually.</p> : null}
          <div className="row"><label className="row"><input type="checkbox" checked={labelConsent} onChange={event=>setLabelConsent(event.target.checked)}/> Allow this label image to be sent to my configured AI provider</label><label className="btn btn-soft btn-sm">Read product label<input type="file" accept="image/jpeg,image/png,image/webp" disabled={webBusy||!labelConsent} style={{display:'none'}} onChange={event=>{const file=event.target.files?.[0];if(file)void readLabel(file);event.target.value='';}}/></label></div>
          <div className="row">
            <input className="input" value={productQuery} placeholder="Product name or https://amazon.com/..." onChange={(event) => setProductQuery(event.target.value)} />
            <button type="button" className="btn btn-hot" disabled={webBusy || !productQuery.trim()} onClick={() => void searchWebProduct()}>
              {webBusy ? 'Searching...' : 'Search'}
            </button>
          </div>
          {webResult && !webResult.proposal ? (
            <div className="stack" role="status">
              <p className="subtle" style={{ margin: 0 }}>{webResult.answer || 'The AI could not identify an exact product.'}</p>
              {webResult.error ? <p className="subtle" style={{ margin: 0 }}><b>Why:</b> {webResult.error}</p> : null}
            </div>
          ) : null}
          {webResult?.sources.length ? (
            <div className="stack">
              <b>Review source websites</b>
              {webResult.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="subtle">{source.title}</a>)}
            </div>
          ) : null}
          {webDraft ? (
            <div className="card stack" style={{ alignItems: 'stretch' }}>
              <div><span className="page-eyebrow">{webResult?.proposal ? 'AI draft — check exact variant' : 'Your product details — check exact variant'}</span><h3 style={{ margin: '4px 0' }}>Review before adding</h3></div>
              <label>Exact product name<input className="input" value={webDraft.name} onChange={event => setWebDraft(draft => draft && {...draft,name:event.target.value})} /></label>
              <label>Brand<input className="input" value={webDraft.brand} onChange={event => setWebDraft(draft => draft && {...draft,brand:event.target.value})} /></label>
              <label>Category<select className="input" value={webDraft.category} onChange={event => setWebDraft(draft => draft && {...draft,category:event.target.value as ProductCategory})}>{PRODUCT_CATEGORIES.map(category => <option key={category} value={category}>{CATEGORY_LABEL[category]}</option>)}</select></label>
              <label>Actives, if confirmed (comma-separated)<input className="input" value={webDraft.actives} onChange={event => setWebDraft(draft => draft && {...draft,actives:event.target.value})} /></label>
              <TextAreaField label="What it is for" className="input" rows={2} value={webDraft.useCase} onChange={event => setWebDraft(draft => draft && {...draft,useCase:event.target.value})}/>
              <label>Best for, if confirmed (comma-separated)<input className="input" value={webDraft.bestFor} onChange={event => setWebDraft(draft => draft && {...draft,bestFor:event.target.value})} /></label>
              <label>Status<select className="input" value={webDraft.status} onChange={event => setWebDraft(draft => draft && {...draft,status:event.target.value as ProductStatus})}><option value="wishlist">Considering</option><option value="active">Using</option><option value="paused">Paused</option><option value="finished">Finished</option></select></label>
              {webResult?.sources.length ? <label>Source for this exact product<select className="input" value={webDraft.sourceUrl} onChange={event => setWebDraft(draft => draft && {...draft,sourceUrl:event.target.value})}><option value="">No source selected</option>{webResult.sources.map(source => <option key={source.url} value={source.url}>{source.title}</option>)}</select></label> : null}
              <p className="subtle" style={{margin:0}}>Only select a source if it matches this exact product and variant. Unconfirmed details can be left blank.</p>
            </div>
          ) : null}
        </div>
      </Modal>
      <Modal
        open={open}
        title="Add products"
        onClose={() => setOpen(false)}
        actions={
          tab === 'json' ? (
            <>
              <button type="button" className="btn btn-soft" onClick={downloadTemplate}>
                Download JSON template
              </button>
              <button type="button" className="btn btn-hot" disabled={busy || !jsonText.trim()} onClick={() => void importJson()}>
                {busy ? 'Importing…' : 'Import'}
              </button>
            </>
          ) : undefined
        }
      >
        <div className="row" style={{ marginBottom: 12 }}>
          <button type="button" className={`btn btn-sm ${tab === 'one' ? 'btn-hot' : 'btn-soft'}`} onClick={() => setTab('one')}>
            One product
          </button>
          <button type="button" className={`btn btn-sm ${tab === 'json' ? 'btn-hot' : 'btn-soft'}`} onClick={() => setTab('json')}>
            Import JSON
          </button>
        </div>
        {tab === 'one' ? (
          <form className="stack" onSubmit={addOne}><DraftFeedback draft={productDraft}/>
            <input className="input" aria-label="Name" placeholder="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <input className="input" aria-label="Brand" placeholder="Brand" value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} />
            <select className="input" aria-label="Product category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ProductCategory }))}>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
            <input className="input" aria-label="Actives (optional)" placeholder="Actives (optional)" value={form.actives} onChange={(e) => setForm((f) => ({ ...f, actives: e.target.value }))} />
            <textarea className="input" rows={2} aria-label="Use case — what job does this product do?" placeholder="Use case — what job does this product do?" value={form.useCase} onChange={(e) => setForm((f) => ({ ...f, useCase: e.target.value }))} />
            <input className="input" aria-label="Best for (comma-separated: dry skin, redness…)" placeholder="Best for (comma-separated: dry skin, redness…)" value={form.bestFor} onChange={(e) => setForm((f) => ({ ...f, bestFor: e.target.value }))} />
            <input className="input" aria-label="Pros (comma-separated)" placeholder="Pros (comma-separated)" value={form.pros} onChange={(e) => setForm((f) => ({ ...f, pros: e.target.value }))} />
            <input className="input" aria-label="Cons / cautions (comma-separated)" placeholder="Cons / cautions (comma-separated)" value={form.cons} onChange={(e) => setForm((f) => ({ ...f, cons: e.target.value }))} />
            <div className="row">
              <label className="chip">
                <input type="checkbox" checked={form.usedInAm} onChange={(e) => setForm((f) => ({ ...f, usedInAm: e.target.checked }))} /> AM
              </label>
              <label className="chip">
                <input type="checkbox" checked={form.usedInPm} onChange={(e) => setForm((f) => ({ ...f, usedInPm: e.target.checked }))} /> PM
              </label>
              <button className="btn btn-hot" type="submit" disabled={busy}>
                Save
              </button>
            </div>
          </form>
        ) : (
          <div className="stack">
            <p className="subtle" style={{ margin: 0 }}>
              Download the template, fill a <code>products</code> array, then paste or upload. Required field: <b>name</b>. Optional: brand, category, actives, usedIn (am/pm), status, notes, pros, cons, useCase, bestFor.
            </p>
            <input className="input" type="file" accept="application/json,.json" onChange={(e) => void onFile(e.target.files?.[0] || null)} />
            <textarea
              className="input"
              style={{ minHeight: 180, fontFamily: 'var(--mono)', fontSize: 12 }}
              placeholder='{"products":[{"name":"…","brand":"…","category":"cleanser","pros":["…"],"cons":["…"],"useCase":"…","bestFor":["…"]}]}'
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

function split(v: string): string[] {
  return v
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function sameProductPage(firstUrl: string, secondUrl: string): boolean {
  try {
    const first = new URL(firstUrl);
    const second = new URL(secondUrl);
    const amazonAsin = (url: URL) => /(^|\.)amazon\./i.test(url.hostname)
      ? url.pathname.match(/\/(?:dp|gp\/product)\/([a-z0-9]{10})(?:\/|$)/i)?.[1]?.toUpperCase()
      : undefined;
    const firstAsin = amazonAsin(first);
    const secondAsin = amazonAsin(second);
    if (firstAsin && secondAsin) return firstAsin === secondAsin;
    return first.origin === second.origin && first.pathname.replace(/\/$/, '') === second.pathname.replace(/\/$/, '');
  } catch {
    return firstUrl === secondUrl;
  }
}
