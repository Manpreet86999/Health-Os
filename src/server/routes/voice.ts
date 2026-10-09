import { Router, raw, type ErrorRequestHandler } from 'express';
import { localWhisper, VoiceError } from '../services/whisper.js';
import { rateLimit } from '../middleware/rateLimit.js';

export const voiceRouter = Router();
voiceRouter.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
voiceRouter.get('/status', (_req, res) => res.json(localWhisper.status()));
voiceRouter.post('/transcribe', rateLimit({ windowMs: 60000, max: 12 }),
  (req, res, next) => {
    if (!/^audio\/(webm|ogg|wav|x-wav|mp4|mpeg)(?:\s*;|$)/i.test(req.headers['content-type'] || '')) {
      res.status(415).json({ error: 'Send a microphone audio recording.', code: 'unsupported_audio' }); return;
    }
    next();
  }, raw({ type: () => true, limit: '4mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      res.status(400).json({ error: 'The recording was empty. Speak and try again.', code: 'empty_audio' }); return;
    }
    const controller = new AbortController();
    const closed = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', closed);
    try {
      const result = await localWhisper.transcribe(req.body, controller.signal);
      if (!controller.signal.aborted) res.json(result);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof VoiceError) res.status(error.status).json({ error: error.message, code: error.code });
      else res.status(503).json({ error: 'Local Whisper is unavailable. Try again or type below.', code: 'unavailable' });
    } finally { res.removeListener('close', closed); }
  });
const uploadError: ErrorRequestHandler = (error, _req, res, next) => {
  if (error.type === 'entity.too.large') res.status(413).json({ error: 'The recording is too large. Record up to one minute at a time.', code: 'audio_too_large' });
  else next(error);
};
voiceRouter.use(uploadError);
