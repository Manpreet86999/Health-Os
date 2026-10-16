/** Pod calendar: each member records a civil date in their IANA timezone. Weeks are Monday–Sunday. */
export function podToday(now = new Date(), timezone = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-');
}
export function podShift(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function podWeek(day: string): string {
  return podShift(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
}
export interface FriendPod { id: string; name: string; owner_id: string; current_period_id: string | null; created_at?: string; }
export interface FriendPodPeriod { id: string; pod_id: string; started_at: string; ended_at: string | null; }
export interface FriendPodMember { pod_id: string; user_id: string; membership_period_id: string | null; display_name: string; joined_at: string; role?: string; }
export interface FriendPodGoal { id: string; pod_id: string; membership_period_id: string | null; name: string; description: string; target_per_week: number; created_at: string | null; archived_at: string | null; }
export interface FriendPodGoalVersion { goal_id: string; membership_period_id: string; effective_week: string; name: string; description: string; target_per_week: number; }
export interface FriendPodCompletion { pod_id: string; membership_period_id: string | null; goal_id: string; user_id: string; day: string; completed: boolean; timezone: string | null; updated_at: string | null; }
export interface PodInvitation { code: string; expiresAt: string; }
export interface PodPreview { status: 'ready' | 'expired' | 'revoked' | 'used' | 'full' | 'invalid'; name?: string; inviter?: string; expiresAt?: string; }
export interface PodCapabilities {
  version: 1 | 2;
  supportsMembershipPeriods: boolean;
  supportsInvitationPreview: boolean;
  supportsGoalVersions: boolean;
  supportsGoalEditing: boolean;
  supportsPodDisplayNames: boolean;
  supportsPodRename: boolean;
  supportsGoalArchive: boolean;
}
export const LEGACY_POD_CAPABILITIES: PodCapabilities = Object.freeze({ version: 1, supportsMembershipPeriods: false, supportsInvitationPreview: false, supportsGoalVersions: false, supportsGoalEditing: false, supportsPodDisplayNames: false, supportsPodRename: false, supportsGoalArchive: false });
export function podGoalAt(goal: FriendPodGoal, versions: FriendPodGoalVersion[], week: string): FriendPodGoal {
  const version = versions.filter(item => item.goal_id === goal.id && item.effective_week <= week).sort((a, b) => b.effective_week.localeCompare(a.effective_week))[0];
  return version ? { ...goal, name: version.name, description: version.description, target_per_week: version.target_per_week } : goal;
}
export function podCount(rows: FriendPodCompletion[], goal: string, user: string): number {
  return new Set(rows.filter(row => row.goal_id === goal && row.user_id === user && row.completed).map(row => row.day)).size;
}
export const POD_STARTERS = [
  { category: 'Train', name: 'Gym', target: 3 }, { category: 'Train', name: 'Gym', target: 4 }, { category: 'Train', name: 'Gym', target: 5 },
  { category: 'Train', name: 'Cardio', target: 3 }, { category: 'Train', name: 'Walk daily', target: 7 },
  { category: 'Eat', name: 'Protein goal', target: 5 }, { category: 'Eat', name: 'Vegetables daily', target: 7 },
  { category: 'Eat', name: 'No junk food', target: 5 }, { category: 'Eat', name: 'Hydration goal', target: 7 },
  { category: 'Recover', name: 'Sleep before 11 PM', target: 6 }, { category: 'Recover', name: '8 hours sleep', target: 5 },
  { category: 'Recover', name: 'Stretching', target: 3 }, { category: 'Recover', name: 'Recovery session', target: 2 },
  { category: 'Care', name: 'Morning skincare', target: 7 }, { category: 'Care', name: 'Evening skincare', target: 7 },
];
