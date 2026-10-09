import test from 'node:test';
import assert from 'node:assert/strict';
import {emptySkinState,localLogReview,skinStatusScore,type SkinLog} from './skin.js';

test('routine-only skin logs do not invent observation scores or coaching conclusions',()=>{
  const log:SkinLog={id:'routine-only',date:'2026-09-13',barrier:null,hydration:null,oiliness:null,irritation:null,concerns:[],notes:'',routineDone:{am:true,pm:false},createdAt:'2026-09-13T08:00:00Z'};
  assert.equal(skinStatusScore(log),null);
  const review=localLogReview(emptySkinState(),log);
  assert.match(review.comment,/without skin observations/i);
  assert.equal(review.pauseActives,false);
});
