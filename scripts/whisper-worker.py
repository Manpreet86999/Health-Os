"""Private, offline Whisper worker. JSON lines in/out; audio never touches disk."""
import base64
import io
import json
import os
import sys

# The project-local VC runtime keeps setup independent of system-wide installs.
_dll_directories = []
if sys.platform == 'win32':
    for directory in (sys.prefix, os.path.join(sys.prefix, 'DLLs'), os.path.join(sys.prefix, 'Scripts')):
        if os.path.isdir(directory):
            _dll_directories.append(os.add_dll_directory(directory))

os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'

import av
import numpy as np
from faster_whisper import WhisperModel


def decode_clip(data):
    # Bound decoded samples too: a small compressed upload can contain long audio.
    parts, samples = [], 0
    with av.open(io.BytesIO(data)) as container:
        if not container.streams.audio:
            raise ValueError('invalid_audio')
        resampler = av.AudioResampler(format='s16', layout='mono', rate=16000)
        for frame in container.decode(audio=0):
            frame.pts = None
            for converted in resampler.resample(frame):
                samples += converted.samples
                if samples > 16000 * 61:
                    raise ValueError('too_long')
                parts.append(converted.to_ndarray().reshape(-1))
        for converted in resampler.resample(None):
            samples += converted.samples
            if samples > 16000 * 61:
                raise ValueError('too_long')
            parts.append(converted.to_ndarray().reshape(-1))
    if not samples:
        raise ValueError('invalid_audio')
    return np.concatenate(parts).astype(np.float32) / 32768.0


model = WhisperModel(sys.argv[1], device='cpu', compute_type='int8', cpu_threads=4,
                     num_workers=1, local_files_only=True)
def transcribe(request):
    try:
        audio = decode_clip(base64.b64decode(request['audio'], validate=True))
        segments, info = model.transcribe(audio, beam_size=5, vad_filter=True,
            condition_on_previous_text=False, vad_parameters={'min_silence_duration_ms': 500})
        # VAD plus Whisper's silence confidence reduce accidental text from noise.
        text = ' '.join(s.text.strip() for s in segments if s.no_speech_prob < 0.6).strip()
        return {'text': text, 'language': info.language, 'duration': len(audio) / 16000}
    except Exception as error:
        code = str(error) if str(error) in ('too_long', 'invalid_audio') else 'invalid_audio'
        return {'error': code}


for line in sys.stdin:
    request = None
    try:
        request = json.loads(line)
        result = transcribe(request)
        print(json.dumps({'id': request.get('id'), **result}), flush=True)
    except Exception:
        print(json.dumps({'id': None, 'error': 'invalid_audio'}), flush=True)
    finally:
        # Drop every audio reference before waiting for another recording.
        request = None
        line = ''
