import { useState } from 'react';
import { useApp } from '../state/AppContext';
export function LoadIncrementEditor() {
  const {db,api,refresh}=useApp();
  const [exercise,setExercise]=useState(''),[increment,setIncrement]=useState('2.5'),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  return <div className="stack"><h4>Available load increments</h4><p className="subtle">Set the smallest total load increase available for an exercise. Progression suggestions use this amount in {db?.profile.units || 'kg'}.</p>
    <label>Exercise<input className="input" list="increment-exercises" value={exercise} onChange={e=>setExercise(e.target.value)}/></label><datalist id="increment-exercises">{db?.exercises.map(e=><option key={e.id} value={e.name}/>)}</datalist>
    <label>Load increment<input className="input" type="number" min="0.01" step="0.01" value={increment} onChange={e=>setIncrement(e.target.value)}/></label>
    <button className="btn btn-soft" disabled={busy} onClick={async()=>{
      const value=Number(increment);if(!exercise.trim()||!Number.isFinite(value)||value<=0||value>100){setMessage('Enter an exercise and an increment above 0 and at most 100.');return;}
      setBusy(true);try{await api.saveTrainingConfig({loadIncrements:{...db?.trainingConfig.loadIncrements,[exercise.trim()]:value}});await refresh();setMessage('Load increment saved.');}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}
    }}>Save load increment</button><p role="status">{message}</p>
  </div>;
}
