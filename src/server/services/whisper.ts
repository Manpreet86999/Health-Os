import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { ROOT } from '../config.js';

export class VoiceError extends Error {
  constructor(public code: string, message: string, public status = 503) { super(message); }
}
export interface VoiceTranscript { text: string; language: string; duration: number }
interface Pending {
  id: number; resolve: (value: VoiceTranscript) => void; reject: (error: Error) => void;
  cleanup: () => void;
}

/** One local worker keeps the model warm. No files, records or remote API calls. */
export class LocalWhisper {
  private worker?: ChildProcessWithoutNullStreams;
  private pending?: Pending;
  private sequence = 0;
  constructor(private options: { python?: string; pythonArgs?: string[]; modelPath?: string; workerPath?: string; timeoutMs?: number } = {}) {}
  private paths() {
    const model = ['tiny', 'base', 'small'].includes(process.env.BODY_OS_WHISPER_MODEL || '') ? process.env.BODY_OS_WHISPER_MODEL! : 'base';
    return {
      model,
      python: this.options.python || path.join(ROOT, 'runtime/whisper/.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
      modelPath: this.options.modelPath || path.join(ROOT, 'runtime/whisper/models', model),
      workerPath: this.options.workerPath || path.join(ROOT, 'scripts/whisper-worker.py'),
    };
  }
  status() {
    const { model, python, modelPath, workerPath } = this.paths();
    const available = [python, workerPath, ...['model.bin', 'config.json', 'tokenizer.json'].map(f => path.join(modelPath, f))].every(existsSync);
    return { available, engine: 'local-whisper', model, busy: Boolean(this.pending), offline: true };
  }
  private finish(error?: Error, result?: VoiceTranscript) {
    const pending = this.pending;
    this.pending = undefined;
    if (!pending) return;
    pending.cleanup();
    if (error) pending.reject(error); else pending.resolve(result!);
  }
  dispose() {
    const worker = this.worker;
    this.worker = undefined;
    this.finish(new VoiceError('cancelled', 'Voice transcription stopped.', 499));
    worker?.kill();
  }
  transcribe(audio: Buffer, signal?: AbortSignal): Promise<VoiceTranscript> {
    if (signal?.aborted) return Promise.reject(new VoiceError('cancelled', 'Voice transcription stopped.', 499));
    if (this.pending) return Promise.reject(new VoiceError('busy', 'Whisper is transcribing another recording. Try again shortly.', 429));
    if (!this.status().available) return Promise.reject(new VoiceError('not_installed', 'Local Whisper is not installed. Run npm run voice:setup on the Health OS computer, then try again. You can also type below.'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const abort = () => this.dispose();
      const timeout = setTimeout(() => {
        this.finish(new VoiceError('timeout', 'Whisper took too long. Try a shorter recording, or type below.', 504));
        this.dispose();
      }, this.options.timeoutMs ?? 180000);
      this.pending = { id, resolve, reject, cleanup: () => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); } };
      signal?.addEventListener('abort', abort, { once: true });
      if (!this.worker) {
        const { python, modelPath, workerPath } = this.paths();
        const worker = spawn(python, [...(this.options.pythonArgs ?? ['-u']), workerPath, modelPath], {
          cwd: ROOT, windowsHide: true,
          env: { ...process.env, HF_HUB_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1', OMP_NUM_THREADS: '4' },
        });
        this.worker = worker;
        worker.stderr.resume(); // Never log audio/transcripts or raw worker diagnostics.
        const lines = createInterface({ input: worker.stdout });
        lines.on('line', line => {
          if (this.worker !== worker) return;
          try {
            const result = JSON.parse(line);
            if (result.id !== this.pending?.id) return;
            if (result.error) {
              this.finish(new VoiceError(result.error, result.error === 'too_long' ? 'Record up to one minute at a time.' : 'This recording could not be decoded. Try recording again.', 400));
            } else if (typeof result.text === 'string' && typeof result.language === 'string' && Number.isFinite(result.duration)) {
              this.finish(undefined, { text: result.text, language: result.language, duration: result.duration });
            } else throw new Error('Invalid worker response');
          } catch {
            this.finish(new VoiceError('worker_failed', 'Local Whisper could not transcribe this recording. Try again or rerun voice setup.'));
            this.dispose();
          }
        });
        const failed = () => {
          lines.close();
          if (this.worker !== worker) return;
          this.worker = undefined;
          this.finish(new VoiceError('worker_failed', 'Local Whisper could not start. Rerun npm run voice:setup on the Health OS computer, or type below.'));
          worker.kill();
        };
        worker.on('error', failed);
        worker.on('exit', failed);
        worker.stdin.on('error', failed);
        worker.unref();
        for (const stream of [worker.stdin, worker.stdout, worker.stderr]) (stream as unknown as { unref?: () => void }).unref?.();
      }
      this.worker.stdin.write(JSON.stringify({ id, audio: audio.toString('base64') }) + '\n');
    });
  }
}

export const localWhisper = new LocalWhisper();
process.once('exit', () => localWhisper.dispose());
