import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { get } from './api';
import { useCloudAccount } from '../state/CloudAccountContext';
import type { HealthAppointment } from '../../shared/appointments';
import type { MedicalReport } from '../../shared/medical';
import type { DoctorQuestion, MedicalFollowUp } from '../../shared/medical-actions';
export interface AppointmentData { appointments: HealthAppointment[]; reports: MedicalReport[]; questions: DoctorQuestion[]; followups: MedicalFollowUp[] }
export function useAppointments() {
  const cloud = useCloudAccount(), client = useQueryClient();
  const key = ['appointments', cloud.savedConfig?.url, cloud.user?.id];
  const result = useQuery<AppointmentData>({ queryKey: key, queryFn: () => get('/api/medical/appointments'), enabled: !!cloud.user, staleTime: 30000 });
  useEffect(() => { const update = () => { void client.invalidateQueries({ queryKey: key }); }; window.addEventListener('health-os-appointments-changed', update); return () => window.removeEventListener('health-os-appointments-changed', update); }, [client, cloud.user?.id, cloud.savedConfig?.url]);
  return result;
}
