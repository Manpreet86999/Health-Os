import { useEffect, useState } from 'react';
import { APP_VERSION } from '../../shared/version';
export function ReleaseSettings() {
  const [status, setStatus] = useState('');
  useEffect(() => { const listener = (event: Event) => setStatus((event as CustomEvent<string>).detail); window.addEventListener('health-os-update-status', listener); return () => window.removeEventListener('health-os-update-status', listener); }, []);
  return <section className="stack" aria-label="Health OS updates"><h3>Health Os · v{APP_VERSION}</h3><p className="subtle">Get new versions from the official Health-Os GitHub releases.</p><div className="row"><button type="button" className="btn btn-soft" onClick={() => { setStatus('Checking for updates…'); window.dispatchEvent(new Event('health-os-check-updates')); }}>Check for updates</button><button type="button" className="btn btn-soft" onClick={() => window.dispatchEvent(new Event('health-os-show-welcome'))}>Explore Health OS features</button></div>{status && <p role="status">{status}</p>}<a href="https://github.com/Manpreet86999/Health-Os/releases" target="_blank" rel="noopener noreferrer">Open official releases</a></section>;
}
