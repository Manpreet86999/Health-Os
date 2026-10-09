import test from 'node:test';
import assert from 'node:assert/strict';
import { reportHtml } from './report-html.js';
import { snapshotFromRecords } from './record-snapshot.js';
test('reports escape user text and reject missing session selections',()=>{
  const db=snapshotFromRecords([]);db.profile.displayName='<script>alert(1)</script>';
  const html=reportHtml(db,'progress');assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
  assert.throws(()=>reportHtml(db,'session','missing'),/No completed sessions/);
});
