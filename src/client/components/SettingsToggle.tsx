import { useId } from 'react';

export function SettingsToggle({ label, description, checked, disabled = false, onChange }: {
  label: string; description?: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return <label className="settings-toggle-row">
    <span className="settings-toggle-copy"><strong>{label}</strong>{description && <span id={id}>{description}</span>}</span>
    <span className="settings-toggle-control"><input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} aria-describedby={description ? id : undefined} onChange={event => onChange(event.target.checked)}/><span className="settings-toggle-track" aria-hidden="true"/></span>
  </label>;
}
