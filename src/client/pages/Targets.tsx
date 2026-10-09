import { useDraftState } from '../lib/use-draft';
import { DraftFeedback } from '../components/DraftFeedback';
import { AutomaticProgress } from '../components/AutomationCenter';
import { LinkedRuleEditor } from '../components/AutomationSettings';
import { useMemo, useState } from 'react';

import { useToast } from '../components/Toast';
import { Modal } from '../components/Modal';
import { useApp } from '../state/AppContext';
import { today } from '../lib/utils';
import type { Target } from '../lib/types';

const GOAL_TYPES = [
  { value: 'strength', label: 'Strength' },
  { value: 'body', label: 'Body' },
  { value: 'body-fat', label: 'Body fat' },
  { value: 'habit', label: 'Habit' },
  { value: 'custom', label: 'Custom' },
];

const emptyForm = () => ({
  retryId:crypto.randomUUID() as string,
  id: '',
  name: '',
  type: 'strength',
  current: '',
  target: '',
  unit: 'kg',
  deadline: '',
  status: 'active',
  linkedExercise: '',
});

function progressPercent(current: number | string, target: number | string, type: string): number {
  const c = Number(current) || 0;
  const t = Number(target) || 0;
  if (t <= 0) return 0;
  if (type === 'body-fat' || String(type).includes('loss')) {
    // lower is better when starting above target
    if (c <= t) return 100;
    // rough progress if we don't know start — invert ratio capped
    return Math.min(99, Math.max(0, Math.round((t / c) * 100)));
  }
  return Math.min(100, Math.max(0, Math.round((c / t) * 100)));
}

export function Targets() {
  const app = useApp();
  const toast = useToast();
  const { db, analytics } = app;
  const [editorId,setEditorId]=useState('');
  const editing=Boolean(editorId),selectedGoal=db?.targets.find(t=>t.id===editorId);
  const goalDraft=useDraftState('training-goal:'+(editorId||'new'),()=>selectedGoal?{
    retryId:selectedGoal.id,id:selectedGoal.id,name:selectedGoal.name,type:selectedGoal.type||'custom',
    current:String(selectedGoal.current??''),target:String(selectedGoal.target??''),unit:selectedGoal.unit||'',
    deadline:selectedGoal.deadline||'',status:selectedGoal.status||'active',linkedExercise:selectedGoal.linkedExercise||'',
  }:emptyForm());const {value:form,setValue:setForm}=goalDraft;
  const [saveError,setSaveError]=useState(''),[saving,setSaving]=useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'overdue'>('all');
  const [checkInGoal, setCheckInGoal] = useState<Target | null>(null);
  const checkInDraft=useDraftState('goal-check-in:'+(checkInGoal?.id||'none'),()=>({id:crypto.randomUUID(),value:String(checkInGoal?.current??''),note:'',date:today()}));const {value:checkIn,setValue:setCheckIn}=checkInDraft;
  const [historyId, setHistoryId] = useState<string | null>(null);

  const goalMeta = useMemo(() => {
    const map = new Map((analytics?.goalProgress || []).map((g) => [g.id, g]));
    return map;
  }, [analytics?.goalProgress]);

  const goals = useMemo(() => {
    return [...(db?.targets || [])].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [db?.targets]);

  const filtered = goals.filter((t) => {
    const meta = goalMeta.get(t.id);
    const status = meta?.status || t.status || 'active';
    if (filter === 'all') return true;
    return status === filter;
  });

  if (!db) return null;

  async function saveGoal() {
    if (!form.name.trim()) {
      setSaveError('Goal name is required');document.querySelector<HTMLInputElement>('input[placeholder="Goal name"]')?.focus();toast.push('Goal name is required', 'err');
      return;
    }
    if(saving||!goalDraft.ready)return;setSaving(true);setSaveError('');
    try {
      await app.api.saveTarget({
        id:form.id||form.retryId,
        name: form.name.trim(),
        type: form.type,
        current: form.current === '' ? 0 : Number(form.current),
        target: form.target === '' ? 0 : Number(form.target),
        unit: form.unit,
        deadline: form.deadline || '',
        status: form.status || 'active',
        linkedExercise: form.linkedExercise || '',
      });
      setForm(emptyForm());await goalDraft.clear();
      setEditorId('');
      await app.refresh();
      toast.push(editing ? 'Goal updated' : 'Goal saved', 'ok');
    } catch (e) {
      setSaveError((e as Error).message);toast.push((e as Error).message, 'err');
    }finally{setSaving(false);}
  }

  function startEdit(t: Target) {
    setEditorId(t.id);
  }

  async function submitCheckIn() {
    if (!checkInGoal) return;
    const value = Number(checkIn.value);
    if (!Number.isFinite(value)) {
      toast.push('Enter a valid value', 'err');
      return;
    }
    try {
      if(!checkInDraft.ready)return;
      await app.api.saveGoalCheckIn({
        id: checkIn.id,
        goalId: checkInGoal.id,
        date: checkIn.date || today(),
        value,
        note: checkIn.note || '',
      });
      setCheckInGoal(null);
      setCheckIn({ id:crypto.randomUUID(),value: '', note: '', date: today() });await checkInDraft.clear();
      await app.refresh();
      toast.push('Check-in saved', 'ok');
    } catch (e) {
      toast.push((e as Error).message, 'err');
    }
  }

  return (
    <div className="fade page-shell">
      <AutomaticProgress kind="goal"/>
      <details className="glass card"><summary>Link a goal to your records</summary><LinkedRuleEditor kind="goal"/></details>
      <header className="page-hero">
        <div>
          <span className="page-eyebrow">Targets</span>
          <h1 className="page-title">Goals</h1>
          <p className="page-sub">Track strength and body targets with check-ins and progress.</p>
        </div>
        <div className="page-hero-actions">
          <div className="page-tabs">
            {(['all', 'active', 'completed', 'overdue'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`page-tab ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="page-panel stack"><DraftFeedback draft={goalDraft}/>{saveError&&<p role="alert">{saveError}. Your edits are retained; save again to retry.</p>}
        <div className="page-panel-head">
          <div>
            <p className="page-section-label">{editing ? 'Update' : 'Create'}</p>
            <h3>{editing ? 'Edit goal' : 'New goal'}</h3>
          </div>
        </div>
        <div className="grid-auto">
          <label className="form-field"><span>Goal name</span><input
            className="input"
            placeholder="Goal name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          /></label>
          <label className="form-field"><span>Type</span><select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {GOAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select></label>
          <label className="form-field"><span>Current</span><input
            className="input"
            type="number"
            placeholder="Current"
            value={form.current}
            onChange={(e) => setForm({ ...form, current: e.target.value })}
          /></label>
          <label className="form-field"><span>Target</span><input
            className="input"
            type="number"
            placeholder="Target"
            value={form.target}
            onChange={(e) => setForm({ ...form, target: e.target.value })}
          /></label>
          <label className="form-field"><span>Unit (kg, %, etc.)</span><input
            className="input"
            placeholder="Unit (kg, %, etc.)"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          /></label>
          <label className="form-field"><span>Deadline</span><input
            className="input"
            type="date"
            value={form.deadline}
            onChange={(e) => setForm({ ...form, deadline: e.target.value })}
          /></label>
          <label className="form-field"><span>Linked exercise (optional)</span><input
            className="input"
            placeholder="Linked exercise (optional)"
            value={form.linkedExercise}
            onChange={(e) => setForm({ ...form, linkedExercise: e.target.value })}
          /></label>
          <label className="form-field"><span>Status</span><select
            className="input"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="paused">Paused</option>
          </select></label>
        </div>
        <div className="row">
          <button type="button" className="btn btn-hot" disabled={saving||!goalDraft.ready} onClick={() => void saveGoal()}>
            {editing ? 'Update goal' : 'Save goal'}
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

      <div className="grid-auto">
        {filtered.map((t) => {
          const meta = goalMeta.get(t.id);
          const pct = meta?.percent ?? progressPercent(t.current, t.target, t.type);
          const status = meta?.status || t.status || 'active';
          const done = status === 'completed' || pct >= 100;
          return (
            <div key={t.id} className="page-panel stack">
              <div className="toolbar">
                <span className={`pill ${done ? 'pill-green' : status === 'overdue' ? 'pill-orange' : 'pill-blue'}`}>
                  {t.type || 'Goal'} · {status}
                </span>
                {t.deadline ? <span className="subtle" style={{ fontSize: 12 }}>Due {t.deadline}</span> : null}
              </div>
              <b style={{ fontSize: '1.25rem' }}>{t.name}</b>
              <p className="subtle" style={{ margin: 0 }}>
                {t.current} → {t.target} {t.unit || ''}
                {meta?.latestCheckIn ? ` · last check-in ${meta.latestCheckIn.date}` : ''}
              </p>
              <div className={`page-progress ${done ? 'done' : ''}`}>
                <span style={{ width: `${pct}%` }} />
              </div>
              <div className="toolbar">
                <span style={{ fontWeight: 800 }}>{pct}%</span>
                {t.linkedExercise ? <span className="subtle" style={{ fontSize: 12 }}>↔ {t.linkedExercise}</span> : null}
              </div>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-hot btn-sm"
                  onClick={() => {
                    setCheckInGoal(t);
                  }}
                >
                  Check in
                </button>
                <button type="button" className="btn btn-soft btn-sm" onClick={() => startEdit(t)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  onClick={() => setHistoryId(historyId === t.id ? null : t.id)}
                >
                  History
                </button>
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  onClick={async () => {
                    try {
                      await app.api.deleteTarget(t.id);
                      await app.refresh();
                    } catch (e) {
                      toast.push((e as Error).message, 'err');
                    }
                  }}
                >
                  Delete
                </button>
              </div>
              {historyId === t.id ? (
                <div className="page-list" style={{ gap: 6 }}>
                  {(db.goalCheckIns || [])
                    .filter((c) => c.goalId === t.id)
                    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
                    .map((c) => (
                      <div key={c.id} className="page-list-item" style={{ fontSize: 13 }}>
                        <span>
                          <b>{c.date}</b> · {c.value} {t.unit || ''}
                        </span>
                        <span className="subtle">{c.note || ''}</span>
                      </div>
                    ))}
                  {!(db.goalCheckIns || []).some((c) => c.goalId === t.id) ? (
                    <p className="subtle" style={{ margin: 0 }}>
                      No check-ins yet.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
        {!filtered.length ? <div className="page-empty">No goals match this filter.</div> : null}
      </div>

      <Modal
        open={Boolean(checkInGoal)}
        title={checkInGoal ? `Check in · ${checkInGoal.name}` : 'Check in'}
        onClose={() => setCheckInGoal(null)}
        actions={
          <>
            <button type="button" className="btn btn-soft" onClick={() => setCheckInGoal(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-hot" onClick={() => void submitCheckIn()}>
              Save check-in
            </button>
          </>
        }
      >
        <div className="stack">
          <label className="form-field"><span>Check In</span><input
            className="input"
            type="date"
            value={checkIn.date}
            onChange={(e) => setCheckIn({ ...checkIn, date: e.target.value })}
          /></label>
          <label className="form-field"><span>Value</span><input
            className="input"
            type="number"
            placeholder="Value"
            value={checkIn.value}
            onChange={(e) => setCheckIn({ ...checkIn, value: e.target.value })}
          /></label>
          <label className="form-field"><span>Note (optional)</span><input
            className="input"
            placeholder="Note (optional)"
            value={checkIn.note}
            onChange={(e) => setCheckIn({ ...checkIn, note: e.target.value })}
          /></label>
        </div>
      </Modal>
    </div>
  );
}
