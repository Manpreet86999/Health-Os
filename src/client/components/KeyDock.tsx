
import { useApp } from '../state/AppContext';
import {
  dockFor,
  mobileNavFor,
  pageIcon,
  pageLabel,
  type WorkspaceId,
} from '../../shared/workspaces';
import { APP_VERSION } from '../../shared/version';

export function KeyDock({
  expanded,
  onHoverChange,
}: {
  expanded: boolean;
  onHoverChange: (v: boolean) => void;
}) {
  const { page, setPage, workspace, setWorkspace, theme, toggleTheme } = useApp();
  const groups = dockFor(workspace);

  return (
    <aside
      className={`keydock ${expanded ? 'expanded' : ''}`}
      aria-label="Command rail"
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      <div className="kd-brand" title="Health OS">
        <div className="mark kd-mark kd-logo"><img src="/health-os-mark.svg?v=20261007" alt="Health OS" /></div>
        <div className="kd-brand-text">
          <strong>Health OS</strong>
          <span>v{APP_VERSION}</span>
        </div>
      </div>

      <div className="kd-switch" role="tablist" aria-label="Workspace">
        <WorkspaceKey
          id="workout"
          label="Workout"
          glyph="W"
          active={workspace === 'workout'}
          expanded={expanded}
          onSelect={() => setWorkspace('workout')}
        />
        <WorkspaceKey
          id="skincare"
          label="Care (Beta)"
          glyph="S"
          active={workspace === 'skincare'}
          expanded={expanded}
          onSelect={() => setWorkspace('skincare')}
        />
      </div>

      <nav className="kd-nav">
        {groups.map((g) => (
          <div key={g.id} className="kd-group">
            <div className="kd-group-label">{g.label}</div>
            {g.items.map((item) => (
              <DockKey
                key={item.page}
                icon={item.icon}
                label={item.label}
                active={page === item.page}
                expanded={expanded}
                onClick={() => setPage(item.page)}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="kd-foot">
        <DockKey
          icon="⚙"
          label="Settings"
          active={page === 'Settings'}
          expanded={expanded}
          onClick={() => setPage('Settings')}
        />
        <DockKey
          icon={theme === 'dark' ? '☾' : '☀'}
          label={theme === 'dark' ? 'Light' : 'Dark'}
          active={false}
          expanded={expanded}
          onClick={toggleTheme}
        />
      </div>
    </aside>
  );
}

function WorkspaceKey({
  id,
  label,
  glyph,
  active,
  expanded,
  onSelect,
}: {
  id: WorkspaceId;
  label: string;
  glyph: string;
  active: boolean;
  expanded: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`kd-ws ${active ? 'active' : ''}`}
      onClick={onSelect}
      title={label}
    >
      <span className="kd-cap" aria-hidden>
        {glyph}
      </span>
      {expanded ? <span className="kd-ws-label">{label}</span> : null}
    </button>
  );
}

function DockKey({
  icon,
  label,
  active,
  expanded,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`kd-key ${active ? 'active' : ''}`}
      onClick={onClick}
      title={label}
      aria-current={active ? 'page' : undefined}
      aria-label={label}
    >
      <span className="kd-cap" aria-hidden>
        {icon}
      </span>
      <span className="kd-label">{label}</span>
      {active && expanded ? <span className="kd-dot" aria-hidden /> : null}
    </button>
  );
}

export function BottomDock() {
  const { page, setPage, workspace } = useApp();
  const items = mobileNavFor(workspace);

  return (
    <nav className="bottom-dock" aria-label="Mobile command dock">
      {items.map((p) => (
        <button
          key={p}
          type="button"
          className={page === p ? 'active' : ''}
          onClick={() => setPage(p)}
        >
          <span className="kd-cap" aria-hidden>
            {pageIcon(p)}
          </span>
          {pageLabel(p)}
        </button>
      ))}
    </nav>
  );
}
