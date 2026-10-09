import { useDraftState } from '../lib/use-draft';
import { DraftFeedback } from '../components/DraftFeedback';
import { StatePanel } from '../components/DesignSystem';
import { BodyMeasurementsVisual } from '../components/BodyMeasurementsVisual';
import { useBiologicalData } from '../lib/use-biological-data';
import { useQuickLog } from '../components/QuickLog';
import { SignalChart } from '../components/SignalChart';
import { weightTrend } from '../../shared/biological-intelligence';
import { useEffect, useMemo, useState } from 'react';

import { useToast } from '../components/Toast';
import { useApp } from '../state/AppContext';
import { today } from '../lib/utils';
import { Modal } from '../components/Modal';
import type { Measurement } from '../lib/types';

type MetricKey = 'weight' | 'bodyFat' | 'waist' | 'muscleMass' | 'waterPercentage';

const METRIC_OPTS: { key: MetricKey; label: string }[] = [
  { key: 'weight', label: 'Weight' },
  { key: 'bodyFat', label: 'Body fat %' },
  { key: 'waist', label: 'Waist' },
  { key: 'muscleMass', label: 'Muscle mass' },
  { key: 'waterPercentage', label: 'Water %' },
];

const emptyForm = () => ({
  retryId:crypto.randomUUID() as string,
  id: '',
  date: today(),
  weight: '',
  waist: '',
  neck: '',
  chest: '',
  arms: '',
  hips: '',
  bmr: '',
  bodyFat: '',
  muscleMass: '',
  waterPercentage: '',
});

function navyBodyFat(
  gender: 'male' | 'female' | undefined,
  waist: number,
  neck: number,
  height: number,
  units: 'kg' | 'lb',
  hips?: number,
): number | null {
  if (!(waist > 0 && neck > 0 && height > 0)) return null;
  const in_w = units === 'kg' ? waist / 2.54 : waist;
  const in_n = units === 'kg' ? neck / 2.54 : neck;
  const in_h = units === 'kg' ? height / 2.54 : height;
  if (gender === 'female') {
    const in_hips = hips ? (units === 'kg' ? hips / 2.54 : hips) : 0;
    if (!(in_hips > 0) || in_w + in_hips <= in_n) return null;
    const bf =
      163.205 * Math.log10(in_w + in_hips - in_n) - 97.684 * Math.log10(in_h) - 78.387;
    return bf > 0 && bf < 60 ? bf : null;
  }
  if (in_w <= in_n) return null;
  const bf = 86.01 * Math.log10(in_w - in_n) - 70.041 * Math.log10(in_h) + 36.76;
  return bf > 0 && bf < 60 ? bf : null;
}

export function Body({initialView='Measurements'}:{initialView?:string}) {
  const showForm=initialView==='Measurements';
  const showTrend=['Weight','Body Composition'].includes(initialView);
  const showHistory=initialView==='Measurement History';
  const {app,records}=useBiologicalData(),quick=useQuickLog();
  const weight=weightTrend(records,today());
  const toast = useToast();
  const { db, analytics, settings } = app;
  const [editorId,setEditorId]=useState('');
  const selectedMeasurement=db?.measurements.find(m=>m.id===editorId),editing=Boolean(editorId);
  const measurementDraft=useDraftState('body-measurement:'+(editorId||'new'),()=>{
    const m=selectedMeasurement;if(!m)return emptyForm();
    return {...emptyForm(),id:m.id,date:m.date||today(),weight:String(m.weight??''),waist:String(m.waist??''),neck:String(m.neck??''),chest:String(m.chest??''),arms:String(m.arms??''),hips:String(m.hips??''),bmr:String(m.bmr??''),bodyFat:String(m.bodyFat??''),muscleMass:String(m.muscleMass??''),waterPercentage:String(m.waterPercentage??'')};
  });const {value:form,setValue:setForm}=measurementDraft;
  const [metric, setMetric] = useState<MetricKey>(initialView==='Body Composition'?'bodyFat':'weight');
  const height = db?.profile?.height;
  const units = db?.profile?.units || 'kg';
  const gender = settings?.gender;

  const sorted = useMemo(
    () => [...(db?.measurements || [])].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    [db?.measurements],
  );

  const deltas = analytics?.bodyDeltas;

  // Navy BF auto-calc
  useEffect(() => {
    if (!measurementDraft.ready || !form.waist || !form.neck || !height) return;
    const bf = navyBodyFat(
      gender,
      Number(form.waist),
      Number(form.neck),
      Number(height),
      units,
      form.hips ? Number(form.hips) : undefined,
    );
    if (bf != null) {
      setForm((f) => ({ ...f, bodyFat: bf.toFixed(1) }));
    }
  }, [form.waist, form.neck, form.hips, height, units, gender,measurementDraft.ready]);

  if (!db) return null;

  function loadEdit(m: Measurement) {
    setEditorId(m.id);
  }

  async function save() {
    try {
      if (!height && form.waist && form.neck) {
        toast.push('Set your height in Settings for Navy body-fat calc', 'info');
      }
      await app.api.saveMeasurement({
        id:form.id||form.retryId,
        date: form.date,
        weight: form.weight,
        waist: form.waist,
        neck: form.neck,
        chest: form.chest,
        arms: form.arms,
        hips: form.hips,
        bmr: form.bmr,
        bodyFat: form.bodyFat,
        muscleMass: form.muscleMass,
        waterPercentage: form.waterPercentage,
      });
      setForm(emptyForm());await measurementDraft.clear();
      setEditorId('');
      await app.refresh();
      toast.push(editing ? 'Measurement updated' : 'Measurement saved', 'ok');
    } catch (e) {
      toast.push((e as Error).message, 'err');
    }
  }

  function deltaLabel(d?: { latest: number; previous?: number; delta30d?: number }, unit = '') {
    if (!d) return '—';
    const parts = [`${d.latest}${unit}`];
    if (d.previous != null) {
      const diff = Math.round((d.latest - d.previous) * 10) / 10;
      parts.push(`${diff > 0 ? '+' : ''}${diff} vs prev`);
    }
    if (d.delta30d != null) {
      parts.push(`${d.delta30d > 0 ? '+' : ''}${d.delta30d} /30d`);
    }
    return parts.join(' · ');
  }

  return (
    <div className="fade page-shell">
      <DraftFeedback draft={measurementDraft}/><header className="page-hero">
        <div>
          <span className="page-eyebrow">Composition</span>
          <h1 className="page-title">{initialView==='Measurement History'?'Body history':initialView}</h1>
          <p className="page-sub">
            Measurements and composition from your recorded history.
          </p>
        </div>
      </header>

      <div className="page-signals">
        <div className="page-signal">
          <span className="page-signal-label">Weight</span>
          <span className="page-signal-value" style={{ fontSize: '1rem' }}>
            {deltaLabel(deltas?.weight, ` ${units}`)}
          </span>
        </div>
        <div className="page-signal">
          <span className="page-signal-label">Body fat</span>
          <span className="page-signal-value" style={{ fontSize: '1rem' }}>
            {deltaLabel(deltas?.bodyFat, '%')}
          </span>
        </div>
        <div className="page-signal">
          <span className="page-signal-label">Waist</span>
          <span className="page-signal-value" style={{ fontSize: '1rem' }}>
            {deltaLabel(deltas?.waist)}
          </span>
        </div>
      </div>

      {(showForm || editing) && <>      <div className="page-panel stack">
        <div className="page-panel-head">
          <div>
            <p className="page-section-label">{editing ? 'Update' : 'Log'}</p>
            <h3>{editing ? 'Edit measurement' : 'Log measurement'}</h3>
          </div>
        </div>
        <BodyMeasurementsVisual values={form} unit={units==='kg'?'cm':'in'}/>
        <div className="grid-auto">
          <label className="form-field"><span>Date</span><input
            className="input"
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
          /></label>
          <label className="form-field"><span>Weight <small>{units}</small></span><input
            className="input"
            type="number"
            placeholder="Weight"
            value={form.weight}
            onChange={(e) => setForm({ ...form, weight: e.target.value })}
          /></label>
          <label className="form-field"><span>Waist <small>{units==='kg'?'cm':'in'}</small></span><input
            className="input"
            type="number"
            placeholder="Waist"
            value={form.waist}
            onChange={(e) => setForm({ ...form, waist: e.target.value })}
          /></label>
          <label className="form-field"><span>Neck <small>{units==='kg'?'cm':'in'}</small></span><input
            className="input"
            type="number"
            placeholder="Neck"
            value={form.neck}
            onChange={(e) => setForm({ ...form, neck: e.target.value })}
          /></label>
          {gender === 'female' ? (
            <label className="form-field"><span>Hips (Navy female)</span><input
              className="input"
              type="number"
              placeholder="Hips (Navy female)"
              value={form.hips}
              onChange={(e) => setForm({ ...form, hips: e.target.value })}
            /></label>
          ) : null}
          <label className="form-field"><span>Chest <small>{units==='kg'?'cm':'in'}</small></span><input
            className="input"
            type="number"
            placeholder="Chest"
            value={form.chest}
            onChange={(e) => setForm({ ...form, chest: e.target.value })}
          /></label>
          <label className="form-field"><span>Arms <small>{units==='kg'?'cm':'in'}</small></span><input
            className="input"
            type="number"
            placeholder="Arms"
            value={form.arms}
            onChange={(e) => setForm({ ...form, arms: e.target.value })}
          /></label>
          <label className="form-field"><span>BMR (kcal)</span><input
            className="input"
            type="number"
            placeholder="BMR (kcal)"
            value={form.bmr}
            onChange={(e) => setForm({ ...form, bmr: e.target.value })}
          /></label>
          <label className="form-field"><span>Body Fat %</span><small>Waist and neck entries calculate a Navy estimate. Replace it with your measured result if available; historical records do not store the method.</small><input
            className="input"
            type="number"
            placeholder="Body Fat %"
            value={form.bodyFat}
            onChange={(e) => setForm({ ...form, bodyFat: e.target.value })}
          /></label>
          <label className="form-field"><span>Muscle Mass <small>{units}</small></span><input
            className="input"
            type="number"
            placeholder="Muscle Mass"
            value={form.muscleMass}
            onChange={(e) => setForm({ ...form, muscleMass: e.target.value })}
          /></label>
          <label className="form-field"><span>Water %</span><input
            className="input"
            type="number"
            placeholder="Water %"
            value={form.waterPercentage}
            onChange={(e) => setForm({ ...form, waterPercentage: e.target.value })}
          /></label>
        </div>
        <div className="row">
          <button type="button" className="btn btn-hot" disabled={!measurementDraft.ready} onClick={() => void save()}>
            {editing ? 'Update' : 'Save'}
          </button>
          {editing ? (
            <button
              type="button"
              className="btn btn-soft"
              onClick={() => {
                setEditorId('');
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>

</>}
      {initialView==='Weight' && <section className="glass card stack"><div className="flow-section-title"><h3>Your weight history</h3><button className="btn btn-hot" onClick={()=>quick.open('vital',undefined,undefined,{metric:'Weight',unit:units})}>Log weight</button></div><SignalChart label="Weight" unit={units} points={weight.points.map(p=>({date:p.date,value:units==='lb'?p.weight*2.2046226218:p.weight}))}/></section>}
      {showTrend && initialView!=='Weight' && <div className="page-panel">
        <div className="page-panel-head">
          <div>
            <p className="page-section-label">Chart</p>
            <h3>Trend</h3>
          </div>
          <div className="page-tabs">
            {METRIC_OPTS.filter(m=>initialView==='Weight'?m.key==='weight':['bodyFat','muscleMass','waterPercentage'].includes(m.key)).map((m) => (
              <button
                key={m.key}
                type="button"
                className={`page-tab ${metric === m.key ? 'active' : ''}`}
                onClick={() => setMetric(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <p className="subtle">Recorded composition values · estimates use the existing Navy method where measurements support it.</p><SignalChart label={METRIC_OPTS.find(m=>m.key===metric)?.label||metric} unit={metric==='muscleMass'?units:'%'} points={sorted.map(m=>({date:m.date,value:m[metric]==null||m[metric]===''?null:Number(m[metric])}))}/>
      </div>

      }

      {showHistory && <div className="page-list">
        {[...sorted].reverse().map((m) => (
          <div key={m.id} className="page-list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
            <div className="toolbar">
              <span className="pill pill-blue">{m.date}</span>
              <div className="row">
                <button type="button" className="btn btn-soft btn-sm" onClick={() => loadEdit(m)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  onClick={async () => {
                    try {
                      await app.api.deleteMeasurement(m.id);
                      await app.refresh();
                      toast.push('Deleted', 'ok');
                    } catch (e) {
                      toast.push((e as Error).message, 'err');
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
            <p className="subtle" style={{ margin: 0 }}>
              Weight: <strong>{m.weight}</strong>
              {m.bodyFat ? ` · BF%: ${m.bodyFat}%` : ''}
              {m.bmr ? ` · BMR: ${m.bmr}` : ''}
              {m.muscleMass ? ` · Muscle: ${m.muscleMass}` : ''}
              {m.waterPercentage ? ` · Water: ${m.waterPercentage}%` : ''}
              <br />
              Waist {m.waist || '-'} · Neck {m.neck || '-'} · Chest {m.chest || '-'} · Arms{' '}
              {m.arms || '-'}
              {m.hips ? ` · Hips ${m.hips}` : ''}
            </p>
          </div>
        ))}
        {!sorted.length ? <StatePanel title="No measurements yet" body="Log a measurement to build your dated history." action={<button className="btn btn-soft" onClick={()=>app.setPage('Body','Measurements')}>Log measurement</button>}/> : null}
      </div>}
    </div>
  );
}
