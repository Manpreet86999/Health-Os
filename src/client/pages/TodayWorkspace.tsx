import { HealthDashboard } from '../components/HealthDashboard';
import { TodayPodsCard } from '../components/TodayPodsCard';
import { friendPods } from '../lib/pods-service';
import { useCloudAccount } from '../state/CloudAccountContext';
import { useApp } from '../state/AppContext';
export function TodayWorkspace(){const cloud=useCloudAccount(),app=useApp();return <><HealthDashboard/><TodayPodsCard userId={cloud.user?.id} project={cloud.savedConfig?.url} service={friendPods} onSignIn={()=>app.setPage('Settings','Data & account')}/></>;}
