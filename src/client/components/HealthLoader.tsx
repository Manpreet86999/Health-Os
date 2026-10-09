import './health-brand.css';

/** Animation is decorative: progress and recovery controls remain independent. */
export function HealthLoader({compact=false}:{compact?:boolean}) {
  return <div className={`health-loader${compact?' is-compact':''}`} aria-hidden="true"><span className="health-buffer-ring" /></div>;
}
