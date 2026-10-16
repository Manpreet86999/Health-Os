export function encodeMonoWav(samples:Float32Array):ArrayBuffer {
  if(samples.length>960000)throw new Error('Record up to one minute.');
  const buffer=new ArrayBuffer(44+samples.length*2),view=new DataView(buffer);
  const tag=(offset:number,text:string)=>{for(let i=0;i<text.length;i++)view.setUint8(offset+i,text.charCodeAt(i));};
  tag(0,'RIFF');view.setUint32(4,36+samples.length*2,true);tag(8,'WAVE');tag(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);tag(36,'data');view.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++){const value=Math.max(-1,Math.min(1,Number.isFinite(samples[i])?samples[i]:0));view.setInt16(44+i*2,Math.round(value*(value<0?32768:32767)),true);}return buffer;
}
export async function recordingToWav(blob:Blob):Promise<Blob> {
  const context=new AudioContext();
  try {
    const decoded=await context.decodeAudioData(await blob.arrayBuffer());
    if(decoded.duration>60.1)throw new Error('Record up to one minute.');
    const rendering=new OfflineAudioContext(1,Math.min(960000,Math.ceil(decoded.duration*16000)),16000);
    const source=rendering.createBufferSource();source.buffer=decoded;source.connect(rendering.destination);source.start();
    const result=await rendering.startRendering();return new Blob([encodeMonoWav(result.getChannelData(0))],{type:'audio/wav'});
  } finally {await context.close();}
}
