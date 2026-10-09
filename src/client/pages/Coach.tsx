import { useEffect, useState } from 'react';
import { useToast } from '../components/Toast';
import { useApp } from '../state/AppContext';

import { storedSession } from '../lib/cloud-session';
const chatKey = () => `body-os-coach-chat:${storedSession()?.uid}`;
const MAX_CHAT = 40;
type WebSource = { title: string; url: string; content: string };

const QUICK_PROMPTS = [
  'Analyze my recent PRs and what to progress next.',
  'Should I deload this week based on readiness and volume?',
  'How do I break a plateau on my main lifts?',
  'Suggest adjustments for my nearest goal deadline.',
];

export function Coach() {
  const app = useApp();
  const toast = useToast();
  const { coach, setCoach, analytics, settings, setPage } = app;
  const [question, setQuestion] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'ai'; content: string; model?: string; sources?: WebSource[] }>>(() => {
    try {
      const raw = localStorage.getItem(chatKey());
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(chatKey(), JSON.stringify(chatHistory.slice(-MAX_CHAT)));
    } catch {
      /* ignore */
    }
  }, [chatHistory]);

  if (!coach || !analytics || !settings) return null;

  const engineLabel = settings.hasAiApiKey || settings.aiProvider === 'ollama'
    ? `${settings.aiProvider || 'AI'} · ${settings.aiModel || 'auto'}`
    : 'Training insights · add an AI key in Settings for personalized coaching';

  async function refreshAi() {
    setBusy(true);
    try {
      const res = await app.api.generateCoachAdvice();
      const nextCoach = res.coach;
      if (!nextCoach) throw new Error('Coach response was empty.');
      setCoach(nextCoach);
      toast.push(
        nextCoach.aiError
          ? `Local fallback: ${nextCoach.aiError}`
          : nextCoach.aiAvailable
            ? `AI coach · ${nextCoach.model || nextCoach.source}`
            : 'Local coach ready',
        nextCoach.aiError ? 'err' : 'ok',
      );
    } catch (e) {
      toast.push((e as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }

  async function ask() {
    if (!question.trim()) return;
    const currentQ = question;
    setQuestion('');
    setChatHistory(h => [...h, { role: 'user', content: currentQ }]);
    setBusy(true);
    try {
      const res = await app.api.coachChat(currentQ);
      const answer=res.answer?.trim();
      if (!res.ok || !answer) throw new Error(res.error?.trim() || 'The AI provider returned no answer. Please try again.');
      setChatHistory(h => [...h, { role: 'ai', content: answer, model: res.model }]);
    } catch (e) {
      const message=(e as Error).message?.trim() || 'Training coach could not return an answer. Please try again.';
      setChatHistory(h=>[...h,{role:'ai',content:message}]);toast.push(message, 'err');
    } finally {
      setBusy(false);
    }
  }

  async function research() {
    if (!question.trim()) return;
    const currentQ = question;
    setQuestion('');
    setChatHistory((history) => [...history, { role: 'user', content: currentQ }]);
    setBusy(true);
    try {
      const result = await app.api.webResearch(currentQ);
      if (!result.ok) {
        toast.push(result.error || 'Web research failed', 'err');
        setChatHistory((history) => [...history, { role: 'ai', content: 'Web research failed: ' + (result.error || 'Unknown error') }]);
        return;
      }
      setChatHistory((history) => [...history, { role: 'ai', content: result.answer || '', model: result.model, sources: result.sources }]);
      await app.refresh();
      toast.push('Web research complete' + (result.searchCount ? ' - ' + result.searchCount + ' searches this month' : ''), 'ok');
    } catch (error) {
      toast.push((error as Error).message, 'err');
    } finally {
      setBusy(false);
    }
  }
  const isAiEnabled = settings.hasAiApiKey || settings.aiProvider === 'ollama';

  return (
    <div className="fade page-shell coach-shell">
      <header className="page-hero">
        <div>
          <span className="page-eyebrow">Intelligence</span>
          <h1 className="page-title">Training coach</h1>
          <p className="page-sub">
            Engine: {engineLabel}{app.db?.sessions.some(s=>['finished','completed'].includes(s.status))?` · Score ${Math.round(coach.score || 0)}`:' · Building training history'}
          </p>
        </div>
        <div className="page-hero-actions">
          <button type="button" className="btn btn-hot btn-sm" disabled={busy} onClick={() => void refreshAi()}>
            {busy ? 'Syncing...' : 'Sync Data'}
          </button>
          {!isAiEnabled && (
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setPage('Settings')}>
              Setup AI
            </button>
          )}
        </div>
      </header>

      <div className="coach-feed">
        {coach.aiError && (
          <div className="page-ai-strip" style={{ borderColor: 'color-mix(in srgb, var(--bad, #fda4af) 40%, var(--line))' }}>
            <span className="pill pill-orange">Fallback</span>
            <p style={{ margin: 0, color: 'var(--bad, #fda4af)', fontWeight: 600, fontSize: 14 }}>{coach.aiError}</p>
          </div>
        )}

        <div>
          <p className="page-section-label">Latest insights</p>
          <div className="grid-2">
            {(coach.advice || []).length > 0 ? coach.advice!.map((x, i) => {
              const isWarning = x.toLowerCase().includes('pain') || x.toLowerCase().includes('reduce');
              return (
                <div key={i} className="page-panel" style={isWarning ? { borderColor: 'color-mix(in srgb, var(--warn, #fda4af) 35%, var(--line))' } : undefined}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 18 }}>{isWarning ? '⚠️' : '💡'}</span>
                    <p style={{ margin: 0, fontWeight: 500, lineHeight: 1.5, fontSize: 14 }}>{x}</p>
                  </div>
                </div>
              );
            }) : (
              <div className="page-empty" style={{ gridColumn: '1 / -1' }}>
                No insights generated yet. Click Sync Data above.
              </div>
            )}
          </div>
        </div>

        {(analytics.recentPrs || []).length > 0 && (
          <div>
            <p className="page-section-label">Recent PRs</p>
            <div className="grid-2">
              {analytics.recentPrs!.slice(-6).reverse().map((p, i) => (
                <div key={`${p.exercise}-${i}`} className="page-panel">
                  <b>{p.exercise}</b>
                  <div className="subtle" style={{ fontSize: 12, marginTop: 4 }}>
                    {p.date} · {p.bestWeight}×{p.bestReps} · e1RM {Math.round(p.bestE1rm)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {isAiEnabled && (
          <div>
            <p className="page-section-label">Progress prompts</p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {QUICK_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="btn btn-soft btn-sm"
                  disabled={busy}
                  onClick={() => {
                    setQuestion(p);
                  }}
                >
                  {p.slice(0, 42)}…
                </button>
              ))}
              {chatHistory.length > 0 && (
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  onClick={() => {
                    setChatHistory([]);
                    localStorage.removeItem(chatKey());
                  }}
                >
                  Clear chat
                </button>
              )}
            </div>
          </div>
        )}

        {(coach.progression || []).length > 0 && (
          <div>
            <p className="page-section-label">Progression targets</p>
            <div className="grid-2">
              {coach.progression!.map((p) => (
                <div key={p.exercise} className="page-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <b style={{ fontSize: 15 }}>{p.exercise}</b>
                    <div className="subtle" style={{ fontSize: 12, marginTop: 4 }}>{p.reason}</div>
                  </div>
                  <div className="pill pill-hot" style={{ fontSize: 13, fontWeight: 700 }}>
                    {p.suggestedWeight} × {p.suggestedReps}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {chatHistory.length > 0 && (
          <div>
            <p className="page-section-label">Conversation</p>
            <div className="stack">
              {chatHistory.map((msg, i) => (
                <div key={i} className={`coach-bubble ${msg.role === 'user' ? 'user' : 'ai'}`}>
                  {msg.role === 'ai' && (
                    <div className="row" style={{ marginBottom: 8 }}>
                      <span className="pill pill-hot" style={{ fontSize: 10 }}>AI</span>
                      {msg.model && <span className="subtle" style={{ fontSize: 10 }}>{msg.model}</span>}
                    </div>
                  )}
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                  {msg.sources?.length ? (
                    <div className="stack" style={{ marginTop: 10 }}>
                      <span className="subtle" style={{ fontSize: 11 }}>Web sources</span>
                      {msg.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" className="subtle" style={{ fontSize: 12 }}>{source.title}</a>)}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="coach-composer">
        <label className="form-field"><span>Ask about your routine, plateaus, or form</span><input
          type="text"
          className="input"
          placeholder="Ask about your routine, plateaus, or form..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void ask();
            }
          }}
          disabled={!isAiEnabled || busy}
        /></label>
        <button
          type="button"
          className="btn btn-hot"
          disabled={!isAiEnabled || busy || !question.trim()}
          onClick={() => void ask()}
        >
          {busy ? '...' : 'Ask'}
        </button>
        {settings.hasTavilyApiKey ? (
          <button type="button" className="btn btn-soft" disabled={busy || !question.trim()} onClick={() => void research()}>
            Search web
          </button>
        ) : null}
      </div>
    </div>
  );
}
