import {useCloudAccount} from '../state/CloudAccountContext';
import { createContext, createElement, useContext, useMemo, useState, type ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import { useBiology } from '../state/BiologyContext';
import { dateOf, live } from '../../shared/biology';
import { effectiveBiology } from '../../shared/legacy-biology';
import { mergeDailyReadiness, readinessModifier } from '../../shared/readiness';
function useBiologicalSnapshot(){
  const app=useApp(),bio=useBiology();
  const cloud=useCloudAccount(),dateKey=`health-os-date:${cloud.savedConfig?.url}:${cloud.user?.id}`;
  const [selectedDate,selectDate]=useState(()=>{const saved=sessionStorage.getItem(dateKey);return saved&&/^\d{4}-\d{2}-\d{2}$/.test(saved)?saved:dateOf(new Date().toISOString());});
  const setSelectedDate=(date:string)=>{sessionStorage.setItem(dateKey,date);selectDate(date);};
  const stored=useMemo(()=>live(bio.records),[bio.records]);
  const observed=useMemo(()=>stored.filter(r=>r.metadata.requiresConfirmation!==true||r.metadata.confirmed===true),[stored]);
  const db=useMemo(()=>app.db?{...app.db,readiness:mergeDailyReadiness(app.db.readiness,bio.records)}:null,[app.db,bio.records]);
  const records=useMemo(()=>db?effectiveBiology(db,observed):observed,[db,observed]);
  const skin=app.skin;
  const current=db?.readiness.find(item=>item.date===dateOf(new Date().toISOString()));
  const programming=current?readinessModifier(current.score,current.painFlag):app.programming;
  return {app:{...app,db,skin,programming},bio,stored,records,selectedDate,setSelectedDate};
}

// Keep the context identity when a lazy view and the shell refresh at different times in Vite.
const Context = (import.meta.hot?.data.biologicalContext || createContext<ReturnType<typeof useBiologicalSnapshot>|null>(null)) as ReturnType<typeof createContext<ReturnType<typeof useBiologicalSnapshot>|null>>;
if(import.meta.hot)import.meta.hot.data.biologicalContext=Context;
// Merge legacy data and readiness once per source change, shared by all views.
export function BiologicalDataProvider({children}:{children:ReactNode}){
  const value=useBiologicalSnapshot();
  return createElement(Context.Provider,{value},children);
}
export function useBiologicalData(){
  const value=useContext(Context);
  if(!value)throw new Error('Biological data provider is missing');
  return value;
}
