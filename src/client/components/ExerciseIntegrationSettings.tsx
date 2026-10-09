import { useState } from 'react';
import { testExerciseMedia } from '../lib/exercise-references';

export function ExerciseIntegrationSettings() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function test(provider: 'youtube') {
    setBusy(true);
    try { setMessage(await testExerciseMedia(provider)); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="page-panel stack"><h3>Exercise guides</h3><p className="subtle">YouTube guides are provided by Health OS for all users. No API key required. Everyone can contribute links to the shared exercise library.</p><div className="row"><button type="button" className="btn btn-soft" disabled={busy} onClick={() => void test('youtube')}>Test YouTube guides</button></div><p className="subtle" role="status">{message}</p></section>;
}
