import { useHealthConnect } from '../state/HealthConnectContext';
import { OSIcon } from './OSIcon';
export function HealthConnectPanel(){
 const hc=useHealthConnect(),permissions=hc.status.permissions.filter(p=>!p.endsWith('IN_BACKGROUND'));
 return <section className="health-panel health-connect-panel stack" aria-label="Health Connect connection">
  <div className="health-panel-heading"><h3><OSIcon name="Health" size={20}/> Health Connect</h3><span className="health-connect-state">{hc.busy?'Refreshing…':hc.enabled&&permissions.length?'Connected':'Not connected'}</span></div>
  <p className="subtle">Bring your steps, sleep and supported readings into Health OS. Choose which categories to allow in Android’s permission screen.</p>
  <div className="health-connect-summary"><strong>{hc.lastSync?new Date(hc.lastSync).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}):'—'}</strong><span>{hc.lastSync?'Last successful read':'No readings synced yet'}</span><small>{hc.lastSync?`${hc.count} readings in the latest refresh`:hc.status.available?'Health Connect is available on this phone':'Checking provider availability'}</small></div>
  <div className="row wrap"><button className="btn btn-hot" disabled={hc.busy} onClick={()=>void hc.connect()}>{hc.enabled?'Review access':'Connect Health Connect'}</button>{hc.enabled&&<button className="btn btn-soft" disabled={hc.busy} onClick={()=>void hc.sync()}>Sync now</button>}<button className="btn btn-soft" onClick={()=>void hc.settings()}>{hc.status.available?'Provider settings':'Install / update provider'}</button></div>
  {hc.enabled&&<><p className="subtle">Active refresh every minute while Health OS is visible, and when you return to it.</p>{hc.status.backgroundAvailable?<div className="health-connect-background"><span>{hc.status.backgroundGranted?'Background reads enabled · scheduled by Android':'Background reads are available'}</span>{!hc.status.backgroundGranted&&<button className="btn btn-soft" disabled={hc.busy} onClick={()=>void hc.connect(true)}>Enable background sync</button>}</div>:<p className="subtle">This provider does not currently allow background reads.</p>}<details><summary>{permissions.length} categories allowed</summary>{permissions.map(p=><p className="subtle" key={p}>{p.replace('android.permission.health.READ_','').toLowerCase().replaceAll('_',' ')}</p>)}</details><button className="flow-text-button" disabled={hc.busy} onClick={()=>void hc.disconnect()}>Disconnect · keep imported history</button></>}
  <p className="subtle">Steps use Health Connect’s daily aggregate. Missing readings stay blank. Health OS reads existing data; your watch or tracking app must supply it to Health Connect.</p>
  <p className="subtle">Readings join your current Health OS account and its existing sync. The app does not write health records to the provider.</p>
  {hc.error&&<p role="alert">{hc.error}</p>}
 </section>;
}
