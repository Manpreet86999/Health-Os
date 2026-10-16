import test from 'node:test';
import assert from 'node:assert/strict';
import {observedCriterionSatisfied} from './intelligence/observed-goal-criteria.js';
const criterion={metric:'sleep_hours' as const,comparison:'at_least' as const,targetValue:7,minimumCount:3,from:'2026-10-01',to:'2026-10-03',tool:'sleep.get_trend'};
const points=[{date:'2026-10-01',hours:7},{date:'2026-10-02',hours:7.5},{date:'2026-10-03',hours:8}];
const observation=(value:unknown)=>[{name:'sleep.get_trend',data:{points:value}}];
test('a physical goal requires the finished window and three distinct actual observation days',()=>{
 assert.equal(observedCriterionSatisfied(criterion,observation(points),'2026-10-03'),true);
 assert.equal(observedCriterionSatisfied(criterion,observation(points),'2026-10-02'),false);
 assert.equal(observedCriterionSatisfied(criterion,observation([points[0],points[0],points[1]]),'2026-10-03'),false);
 assert.equal(observedCriterionSatisfied(criterion,[], '2026-10-03'),false);
 assert.equal(observedCriterionSatisfied(criterion,[{name:'sleep.get_trend',error:'unavailable',data:{points}}],'2026-10-03'),false);
 assert.equal(observedCriterionSatisfied({...criterion,tool:'knowledge.search'},observation(points),'2026-10-03'),false);
 assert.equal(observedCriterionSatisfied(criterion,observation(points.map(p=>({...p,hours:5}))),'2026-10-03'),false);
});
test('nutrition goals use completed diaries and weight goals require canonical kilograms',()=>{
 const days=points.map(p=>({date:p.date,protein:100,complete:false}));
 const c={...criterion,metric:'protein_g' as const,tool:'nutrition.get_history',targetValue:90};
 assert.equal(observedCriterionSatisfied(c,[{name:c.tool,data:{series:days}}],'2026-10-03'),false);
 assert.equal(observedCriterionSatisfied(c,[{name:c.tool,data:{series:days.map(d=>({...d,complete:true}))}}],'2026-10-03'),true);
 const weight={...criterion,metric:'weight_kg' as const,tool:'body.get_weight_history',comparison:'within' as const,targetValue:70,tolerance:.5};
 const weights=points.map(p=>({date:p.date,value:70,unit:'kg'}));
 assert.equal(observedCriterionSatisfied(weight,[{name:weight.tool,data:weights}],'2026-10-03'),true);
 assert.equal(observedCriterionSatisfied(weight,[{name:weight.tool,data:weights.map(w=>({...w,unit:'lb'}))}],'2026-10-03'),false);
});
