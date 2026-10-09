import { cloudFetch as fetch } from '../lib/cloud-api';
import { useEffect, useState } from 'react';
import { getAuthToken } from '../lib/api';
import { useApp } from '../state/AppContext';

export interface AppTask {
  id: string;
  type: 'missing_session' | 'weekly_measurement';
  title: string;
  description: string;
  payload?: any;
}

export function QueueModal() {
  const app = useApp();
  const [tasks, setTasks] = useState<AppTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [closed, setClosed] = useState(false);
  const token = getAuthToken();

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/queue/pending', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setTasks(await res.json());
    } catch (error) {
      console.error('Failed to fetch pending tasks', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token && app.db) void fetchTasks();
  }, [token, app.db]);

  const handleSkipSession = async (task: AppTask) => {
    await fetch('/api/queue/skip-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(task.payload),
    });
    await app.refresh();
    await fetchTasks();
  };

  const handleLogSession = (task: AppTask) => {
    app.setActiveDay(task.payload.dayKey);
    app.setPage('Dashboard');
    setTasks((current) => current.filter((item) => item.id !== task.id));
  };

  const handleLogMeasurement = () => {
    app.setPage('Body');
    setTasks((current) => current.filter((item) => item.id !== 'weekly-measurement'));
  };

  if (loading || tasks.length === 0 || closed) return null;

  return (
    <div className="task-queue-backdrop" role="dialog" aria-modal="true" aria-labelledby="task-queue-title">
      <div className="task-queue-dialog">
        <div className="task-queue-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 id="task-queue-title" className="section-title" style={{ marginTop: 0 }}>Pending Tasks</h2>
            <p className="subtle">Please resolve your pending tasks to keep Health OS fully updated.</p>
          </div>
          <button type="button" className="btn btn-soft" style={{ padding: '4px 8px', marginLeft: '12px' }} onClick={() => setClosed(true)}>✕</button>
        </div>

        <div className="task-queue-list">
          {tasks.map((task) => (
            <div key={task.id} className="task-queue-item">
              <h3>{task.title}</h3>
              <p className="subtle">{task.description}</p>

              {task.type === 'missing_session' ? (
                <div className="task-queue-actions">
                  <button className="btn btn-hot" onClick={() => handleLogSession(task)}>
                    Log Workout
                  </button>
                  <button className="btn btn-soft" onClick={() => handleSkipSession(task)}>
                    Mark Skipped
                  </button>
                </div>
              ) : (
                <button className="btn btn-hot task-queue-full-action" onClick={handleLogMeasurement}>
                  Log Measurements Now
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
