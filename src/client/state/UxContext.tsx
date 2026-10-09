import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { defaultUxPreferences, uxPreferencesSchema, type UxPreferences } from '../../shared/ux';
import { useApp } from './AppContext';
import { useToast } from '../components/Toast';

const Context = createContext<{ preferences: UxPreferences; save: (value: UxPreferences) => Promise<void>; saving: boolean }>({ preferences: defaultUxPreferences(), save: async () => {}, saving: false });
export const useUx = () => useContext(Context);
export function UxProvider({ children }: { children: ReactNode }) {
  const app = useApp(), toast = useToast(), [saving, setSaving] = useState(false);
  const preferences = useMemo(() => {
    const result = uxPreferencesSchema.safeParse((app.settings as unknown as { uxPreferences?: unknown })?.uxPreferences || {});
    return result.success ? result.data : defaultUxPreferences();
  }, [app.settings]);
  const save = async (value: UxPreferences) => {
    setSaving(true);
    try { await app.api.saveSettings({ uxPreferences: uxPreferencesSchema.parse(value) } as any); await app.refresh(); toast.push('Preferences saved to account', 'ok'); }
    finally { setSaving(false); }
  };
  return <Context.Provider value={{ preferences, save, saving }}>{children}</Context.Provider>;
}
