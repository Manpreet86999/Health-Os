import type { useVoiceInput } from '../lib/use-voice-input';
import { OSIcon } from './OSIcon';

export function VoiceInputControl({ voice, title = 'Speak your log', startLabel = 'Start speaking', stopLabel = 'Stop speaking' }: {
  voice: ReturnType<typeof useVoiceInput>; title?: string; startLabel?: string; stopLabel?: string;
}) {
  const processing = voice.state === 'processing';
  const recording = voice.state === 'listening';
  return <section className="voice-input-panel" aria-label={title} data-state={voice.state}>
    <div className="voice-input-heading"><strong><OSIcon name="Voice" size={20}/>{title}</strong>
      <button type="button" className="btn btn-soft" aria-label={processing ? 'Transcribing audio' : voice.active ? stopLabel : startLabel} disabled={processing} onClick={voice.active ? voice.stop : voice.start}>
        {processing ? 'Transcribing…' : voice.active ? 'Stop speaking' : voice.state === 'error' ? 'Try microphone again' : 'Start speaking'}
      </button>
    </div>
    {(recording || processing) && <div className="voice-activity" data-phase={voice.state}>
      <div className="voice-activity-icon" aria-hidden="true"><OSIcon name="Voice" size={22}/>{processing && <span className="voice-buffer-ring"/>}</div>
      {recording ? <div className="voice-waveform" role="meter" aria-label="Microphone input level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.max(...voice.levels) * 100)}>
        {voice.levels.map((level, index) => <span key={index} className="voice-wave-bar" aria-hidden="true" style={{ transform: `scaleY(${0.08 + level * 0.92})`, opacity: 0.4 + level * 0.6 }}/>) }
      </div> : <div className="voice-buffer-dots" aria-hidden="true"><span/><span/><span/></div>}
    </div>}
    <p className={voice.message ? undefined : 'voice-status-empty'} role={voice.state === 'error' ? 'alert' : 'status'} aria-live="polite">{voice.message}</p>
  </section>;
}
