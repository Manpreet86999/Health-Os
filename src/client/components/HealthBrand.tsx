import './health-brand.css';

export function HealthBrand({symbolOnly=false}:{symbolOnly?:boolean}) {
  return <span className="health-brand"><img src="/health-os-mark.svg?v=20261007" width="40" height="40" alt={symbolOnly?'Health OS':''}/>{!symbolOnly&&<strong>Health <span style={{color:'var(--hos-primary)',background:'none'}}>OS</span></strong>}</span>;
}
