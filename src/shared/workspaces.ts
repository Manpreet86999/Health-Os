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
export const SKIN_HOME: Page = 'Today';

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
      { page: 'Targets', icon: '◎', label: 'Goals' },
      { page: 'Body', icon: '◌', label: 'Body' },
      { page: 'Reports', icon: '📄', label: 'Reports' },
      { page: 'ExerciseHistory', icon: '↗', label: 'Lift history' },
    ],
  },
];

export const SKIN_DOCK: DockGroup[] = [];

export const WORKOUT_MOBILE: Page[] = ['Dashboard', 'Tracker', 'Records', 'Analyzer', 'Settings'];
export const SKIN_MOBILE: Page[] = WORKOUT_MOBILE;

const SKIN_PAGES = new Set<Page>();

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
  'Targets',
  'Body',
  'Reports',
]);

const ALL_PAGES = new Set<Page>([...WORKOUT_PAGES,'Today','Recover','Insights','Habits','Search','Settings','Profile','Sync','Permissions']);

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
  return 'Today';
}

export function dockFor(workspace: WorkspaceId): DockGroup[] {
  return WORKOUT_DOCK;
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
