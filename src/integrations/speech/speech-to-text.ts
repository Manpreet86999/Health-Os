export interface SpeechTranscript {text:string;language:string;duration:number;}
export interface SpeechToText {
  status(): {available:boolean;engine:string;model:string;busy:boolean;offline:boolean};
  transcribe(audio:Buffer,signal?:AbortSignal):Promise<SpeechTranscript>;
  dispose():void;
}
