import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

type VoiceState = 'idle' | 'starting' | 'listening' | 'processing' | 'done' | 'error';
const waveBars = 21;
const quietWave = () => Array<number>(waveBars).fill(0);
interface Recording {
  controller: AbortController; recorder?: MediaRecorder; stream?: MediaStream;
  chunks: Blob[]; bytes: number; timer?: ReturnType<typeof setTimeout>;
  audioContext?: AudioContext; audioSource?: MediaStreamAudioSourceNode; frame?: number;
}
function stopMeter(recording: Recording) {
  if (recording.frame !== undefined) cancelAnimationFrame(recording.frame);
  recording.frame = undefined;
  recording.audioSource?.disconnect();
  recording.audioSource = undefined;
  if (recording.audioContext) void recording.audioContext.close().catch(() => {});
  recording.audioContext = undefined;
}
const initialMessage = 'Speak into your microphone, then press Stop speaking to transcribe. Record up to one minute.';
const deviceErrors: Record<string, string> = {
  NotAllowedError: "Microphone access is blocked. Allow microphone access in this site's browser permissions, then try again. You can also type below.",
  NotFoundError: 'No microphone is available. Connect a microphone and check your system sound settings, then try again.',
  NotReadableError: 'Your microphone is busy or unavailable. Close other apps using it, then try again.',
  SecurityError: 'Microphone access needs HTTPS or localhost. Check browser permissions, or type below.',
};

/** Record in memory, transcribe with the personal worker, and return editable text only. */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const [state, setState] = useState<VoiceState>('idle');
  const [message, setMessage] = useState(initialMessage);
  const [levels, setLevels] = useState(quietWave);
  const current = useRef<Recording | null>(null);
  const transcript = useRef(onTranscript);
  transcript.current = onTranscript;
  const release = useCallback(() => {
    const recording = current.current;
    current.current = null;
    if (!recording) return;
    clearTimeout(recording.timer);
    stopMeter(recording);
    recording.controller.abort();
    if (recording.recorder) {
      recording.recorder.ondataavailable = recording.recorder.onstop = recording.recorder.onerror = null;
      if (recording.recorder.state !== 'inactive') { try { recording.recorder.stop(); } catch { /* Already stopped. */ } }
    }
    recording.stream?.getTracks().forEach(track => track.stop());
    recording.chunks.length = 0;
  }, []);
  const cancel = useCallback(() => { release(); setLevels(quietWave()); setState('idle'); setMessage(initialMessage); }, [release]);
  useEffect(() => release, [release]);
  const fail = useCallback((text: string) => { release(); setLevels(quietWave()); setState('error'); setMessage(text); }, [release]);

  const start = useCallback(async () => {
    if (current.current) return;
    if (!window.isSecureContext) {
      fail('Microphone access needs a secure connection. Open Health OS using HTTPS or localhost on this computer. You can also type below.'); return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      fail('Voice recording is unavailable in this browser. Open Health OS in a current browser, or type below.'); return;
    }
    const recording: Recording = { controller: new AbortController(), chunks: [], bytes: 0 };
    current.current = recording;
    setLevels(quietWave());
    // Resume within the click gesture; metering is optional and never blocks recording.
    try {
      const Context = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Context) { recording.audioContext = new Context(); void recording.audioContext.resume().catch(() => {}); }
    } catch { /* Recording still works when Web Audio is unavailable. */ }
    setState('starting'); setMessage('Checking your personal worker…');
    recording.timer = setTimeout(() => {
      if (current.current === recording) fail('Microphone access is still pending. Check the browser permission prompt, then try again or type below.');
    }, 20000);
    try {
      const status = await api<{ available: boolean; busy: boolean; message?: string }>('/api/voice/status', { signal: recording.controller.signal });
      if (current.current !== recording) return;
      if (!status.available) { fail(status.message || 'Your personal worker is unavailable. Check Settings → Connections → Local worker, then try again. You can also type below.'); return; }
      if (status.busy) { fail('Whisper is transcribing another recording. Try again shortly, or type below.'); return; }
      setMessage('Waiting for microphone access… allow the browser prompt, then speak.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (current.current !== recording) { stream.getTracks().forEach(track => track.stop()); return; }
      recording.stream = stream;
      try {
        const context = recording.audioContext;
        if (context) {
          const analyser = context.createAnalyser();
          analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.7;
          recording.audioSource = context.createMediaStreamSource(stream);
          recording.audioSource.connect(analyser); // No speaker output or microphone echo.
          const samples = new Uint8Array(analyser.fftSize);
          const frequencies = new Uint8Array(analyser.frequencyBinCount);
          const interval = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 250 : 70;
          let lastFrame = -interval;
          const sample = (time: number) => {
            if (current.current !== recording || !recording.audioContext) return;
            if (time - lastFrame >= interval) {
              lastFrame = time;
              analyser.getByteTimeDomainData(samples);
              analyser.getByteFrequencyData(frequencies);
              const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
              const volume = Math.min(1, Math.sqrt(Math.max(0, rms - 0.008)) * 3);
              setLevels(Array.from({ length: waveBars }, (_, i) => {
                const band = Math.min(frequencies.length - 1, Math.round((180 + i * 150) / (context.sampleRate / analyser.fftSize)));
                const envelope = 0.4 + 0.6 * Math.sin(Math.PI * (i + 1) / (waveBars + 1));
                return volume * envelope * (0.4 + 0.6 * frequencies[band] / 255);
              }));
            }
            recording.frame = requestAnimationFrame(sample);
          };
          recording.frame = requestAnimationFrame(sample);
        }
      } catch { stopMeter(recording); /* Optional visualizer must not interrupt voice capture. */ }
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 });
      recording.recorder = recorder;
      recorder.ondataavailable = event => {
        if (current.current !== recording || !event.data.size) return;
        recording.bytes += event.data.size;
        if (recording.bytes > 4 * 1024 * 1024) { fail('The recording is too large. Try a shorter recording, or type below.'); return; }
        recording.chunks.push(event.data);
      };
      recorder.onerror = () => {
        if (current.current === recording) fail('The microphone stopped recording. Check your input device, then try again or type below.');
      };
      recorder.onstop = async () => {
        if (current.current !== recording) return;
        clearTimeout(recording.timer);
        stopMeter(recording); setLevels(quietWave());
        stream.getTracks().forEach(track => track.stop());
        setState('processing'); setMessage('Transcribing…');
        recording.timer = setTimeout(() => {
          if (current.current === recording) fail('Whisper took too long. Try a shorter recording, or type below.');
        }, 185000);
        try {
          const audio = new Blob(recording.chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
          recording.chunks.length = 0;
          if (!audio.size) { fail('The recording was empty. Speak and try again, or type below.'); return; }
          const result = await api<{ text: string }>('/api/voice/transcribe', {
            method: 'POST', headers: { 'Content-Type': audio.type }, body: audio, signal: recording.controller.signal,
          });
          if (current.current !== recording) return;
          const text = result.text.trim();
          if (!text) { fail('No speech was heard. Speak closer to your microphone and try again, or type below.'); return; }
          release(); transcript.current(text); setState('done');
          setMessage('');
        } catch (error) {
          if (current.current !== recording) return;
          fail(error instanceof TypeError ? 'Could not reach your personal worker. Check your internet connection and that the worker is running, then try again or type below.' : error instanceof Error ? error.message : 'Whisper could not transcribe this recording. Try again or type below.');
        }
      };
      clearTimeout(recording.timer);
      recorder.start(1000);
      setState('listening'); setMessage('Recording… speak now. Press Stop speaking to transcribe your words.');
      recording.timer = setTimeout(() => {
        if (current.current === recording && recorder.state === 'recording') {
          stopMeter(recording); setLevels(quietWave());
          setState('processing'); setMessage('Transcribing…');
          recorder.stop();
        }
      }, 60000);
    } catch (error) {
      if (current.current !== recording) return;
      const name = error instanceof Error ? error.name : '';
      fail(deviceErrors[name] || (error instanceof TypeError ? 'Could not check your personal worker. Check your internet connection, then try again or type below.' : error instanceof Error ? error.message : 'Voice recording could not start. Check microphone access, then try again or type below.'));
    }
  }, [fail, release]);
  const stop = useCallback(() => {
    const recording = current.current;
    if (!recording) return;
    if (!recording.recorder) { cancel(); return; }
    if (recording.recorder.state !== 'recording') return;
    clearTimeout(recording.timer);
    stopMeter(recording); setLevels(quietWave());
    setState('processing'); setMessage('Transcribing…');
    try { recording.recorder.stop(); } catch { fail('Voice recording could not finish. Try again or type below.'); }
  }, [cancel, fail]);
  return { state, message, levels, start, stop, cancel, active: ['starting', 'listening', 'processing'].includes(state) };
}
