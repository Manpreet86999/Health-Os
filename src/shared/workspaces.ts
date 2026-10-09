import type { Page } from './types.js';
import type { WorkspaceDefinition } from './platform.js';
import { SYNC_ENTITY_TYPES } from './sync.js';

export type WorkspaceId = 'workout' | 'skincare';

/**
 * Web navigation remains compatible with its existing names, while the
 * platform registry gives future workspaces one explicit extension point.
 */
export const PLATFORM_WORKSPACES: readonly WorkspaceDefinition[] = [
  {id:'training',label:'Training',home:'Dashboard',entityTypes:SYNC_ENTITY_TYPES.filter(type=>!type.startsWith('skin')&&type!=='healthReading'),optionalIntegrations:['ai','drive','health','pc']},
  {id:'care',label:'Care',home:'SkinOverview',entityTypes:SYNC_ENTITY_TYPES.filter(type=>type.startsWith('skin')),optionalIntegrations:['ai','drive']},
  {id:'core',label:'Core',home:'Settings',entityTypes:['healthReading'],optionalIntegrations:['drive','health','pc']},
];

export function platformWorkspace(id:string): WorkspaceDefinition | undefined {return PLATFORM_WORKSPACES.find(workspace=>workspace.id===id);}

export interface DockItem {
  page: Page;
  icon: string;
  label: string;
}

export interface DockGroup {
  id: string;
  label: string;
  items: DockItem[];
}

export const WORKOUT_HOME: Page = 'Dashboard';
export const SKIN_HOME: Page = 'SkinOverview';

export const WORKOUT_DOCK: DockGroup[] = [
  {
    id: 'train',
    label: 'Workout',
    items: [
      { page: 'Dashboard', icon: '⌂', label: 'Today' },
      { page: 'Tracker', icon: '▶', label: 'Train' },
      { page: 'Planner', icon: '▦', label: 'Planner' },
      { page: 'Records', icon: '≡', label: 'Records' },
      { page: 'Library', icon: '□', label: 'Library' },
      { page: 'Calendar', icon: '▣', label: 'Calendar' },
      { page: 'Programs', icon: '◇', label: 'Programs' },
    ],
  },
  {
    id: 'insight',
    label: 'Insight',
    items: [
      { page: 'Analyzer', icon: '◆', label: 'Progress' },
      { page: 'Coach', icon: '✦', label: 'Coach' },
      { page: 'Targets', icon: '◎', label: 'Goals' },
      { page: 'Body', icon: '◌', label: 'Body' },
      { page: 'Reports', icon: '📄', label: 'Reports' },
      { page: 'ExerciseHistory', icon: '↗', label: 'Lift history' },
    ],
  },
];

export const SKIN_DOCK: DockGroup[] = [
  { id: 'daily', label: 'Daily care', items: [
    { page: 'SkinOverview', icon: '⌂', label: 'Today' },
    { page: 'SkinAi', icon: '✦', label: 'Coach' },
    { page: 'SkinCheckIn', icon: '◌', label: 'Check-in' },
    { page: 'SkinCalendar', icon: '▣', label: 'Calendar' },
  ]},
  { id: 'plan', label: 'Planning', items: [
    { page: 'SkinRoutine', icon: '▦', label: 'Care Plan' },
    { page: 'SkinProducts', icon: '◈', label: 'My Products' },
    { page: 'SkinGoals', icon: '◎', label: 'Goals & Commitment' },
  ]},
  { id: 'understand', label: 'Understanding me', items: [
    { page: 'SkinProgress', icon: '↗', label: 'Progress' },
    { page: 'SkinReviews', icon: '◇', label: 'Reviews' },
    { page: 'SkinProfile', icon: '□', label: 'My Profile' },
  ]},
];

export const WORKOUT_MOBILE: Page[] = ['Dashboard', 'Tracker', 'Records', 'Analyzer', 'Settings'];
export const SKIN_MOBILE: Page[] = ['SkinOverview', 'SkinAi', 'SkinProducts', 'SkinRoutine', 'SkinGoals'];

const SKIN_PAGES = new Set<Page>([
  'SkinOverview',
  'SkinRoutine',
  'SkinProfile',
  'SkinProducts',
  'SkinProgress',
  'SkinAi',
  'SkinGoals',
  'SkinCalendar',
  'SkinCheckIn',
  'SkinReviews',
]);

const WORKOUT_PAGES = new Set<Page>([
  'Dashboard',
  'Tracker',
  'Planner',
  'Records',
  'Library',
  'Calendar',
  'Programs',
  'Analyzer',
  'ExerciseHistory',
  'Coach',
  'Targets',
  'Body',
  'Reports',
]);

const ALL_PAGES = new Set<Page>([
  ...WORKOUT_PAGES,
  ...SKIN_PAGES,
  'Settings', 'Today', 'Timeline', 'Eat', 'Recover', 'Health', 'Insights', 'Habits', 'Nudges', 'Experiments', 'Research', 'BodyCoach', 'Search', 'Sync', 'Permissions', 'Profile',
]);

export function isPage(value: string | null | undefined): value is Page {
  return Boolean(value && ALL_PAGES.has(value as Page));
}

export function workspaceOf(page: Page): WorkspaceId | 'system' {
  if (page === 'Settings') return 'system';
  if (SKIN_PAGES.has(page)) return 'skincare';
  if (WORKOUT_PAGES.has(page)) return 'workout';
  return 'workout';
}

export function homeOf(workspace: WorkspaceId): Page {
  return workspace === 'skincare' ? SKIN_HOME : WORKOUT_HOME;
}

export function dockFor(workspace: WorkspaceId): DockGroup[] {
  return workspace === 'skincare' ? SKIN_DOCK : WORKOUT_DOCK;
}

export function mobileNavFor(workspace: WorkspaceId): Page[] {
  return workspace === 'skincare' ? SKIN_MOBILE : WORKOUT_MOBILE;
}

export function pageLabel(page: Page): string {
  const all = [...WORKOUT_DOCK, ...SKIN_DOCK].flatMap((g) => g.items);
  const hit = all.find((i) => i.page === page);
  if (hit) return hit.label;
  if (page === 'Settings') return 'Settings';
  return page;
}

export function pageIcon(page: Page): string {
  const all = [...WORKOUT_DOCK, ...SKIN_DOCK].flatMap((g) => g.items);
  const hit = all.find((i) => i.page === page);
  if (hit) return hit.icon;
  if (page === 'Settings') return '⚙';
  return '·';
}
