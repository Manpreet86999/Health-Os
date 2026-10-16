import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { SpeechToText, SpeechTranscript } from './speech-to-text.js';

/** Offline native CLI, fixed arguments, ephemeral private audio, no cloud fallback. */
export class WhisperCpp implements SpeechToText {
  private busy=false;
  private child?:ChildProcess;
  constructor(private options:{executable:string;model:string;timeoutMs?:number;argsPrefix?:string[]}){}
  status(){return {available:existsSync(this.options.executable)&&existsSync(this.options.model),engine:'whisper.cpp',model:path.basename(this.options.model),busy:this.busy,offline:true};}
  dispose(){this.child?.kill();this.child=undefined;}
  async transcribe(audio:Buffer,signal?:AbortSignal):Promise<SpeechTranscript> {
    if(signal?.aborted)throw new Error('Voice transcription cancelled.');
    if(this.busy)throw new Error('Whisper is busy. Try again shortly.');
    if(!this.status().available)throw new Error('Install the local Whisper runtime with npm run voice:setup:cpp.');
    if(audio.length<44||audio.length>1920044||audio.toString('ascii',0,4)!=='RIFF'||audio.toString('ascii',8,12)!=='WAVE'||audio.toString('ascii',12,16)!=='fmt '||audio.readUInt32LE(16)!==16||audio.readUInt16LE(20)!==1||audio.readUInt16LE(22)!==1||audio.readUInt32LE(24)!==16000||audio.readUInt16LE(34)!==16||audio.toString('ascii',36,40)!=='data'||audio.readUInt32LE(40)!==audio.length-44)throw new Error('Voice needs mono 16 kHz PCM WAV audio, up to one minute.');
    this.busy=true;let folder:string|undefined;
    try {
      folder=await mkdtemp(path.join(os.tmpdir(),'health-os-voice-'));
      const input=path.join(folder,'audio.wav'),output=path.join(folder,'transcript');
      await writeFile(input,audio,{mode:0o600});
      await new Promise<void>((resolve,reject)=>{
        const child=spawn(this.options.executable,[...(this.options.argsPrefix||[]),'-m',this.options.model,'-f',input,'-oj','-of',output,'-l','auto','-nt','-np'],{windowsHide:true,stdio:'ignore'});this.child=child;
        const abort=()=>{child.kill();reject(new Error('Voice transcription cancelled.'));};
        const timer=setTimeout(()=>{child.kill();reject(new Error('Whisper took too long. Try a shorter recording.'));},this.options.timeoutMs??120000);
        const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(this.child===child)this.child=undefined;};
        child.once('error',()=>{cleanup();reject(new Error('Local Whisper could not start.'));});
        child.once('exit',code=>{cleanup();code===0?resolve():reject(new Error('Local Whisper could not transcribe this recording.'));});
        signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
      });
      const result=JSON.parse(await readFile(`${output}.json`,'utf8'));
      const text=Array.isArray(result.transcription)?result.transcription.map((row:{text?:string})=>row.text||'').join(' ').trim():'';
      if(text.length>16000)throw new Error('Invalid transcription.');
      return {text,language:String(result.result?.language||'unknown'),duration:(audio.length-44)/32000};
    } finally {
      this.busy=false;
      if(folder&&path.dirname(folder)===os.tmpdir()&&path.basename(folder).startsWith('health-os-voice-'))await rm(folder,{recursive:true,force:true});
    }
  }
}
