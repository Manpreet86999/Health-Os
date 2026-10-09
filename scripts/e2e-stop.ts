export default async function stop() {
  await fetch('http://127.0.0.1:10091/__test/shutdown',{method:'POST',signal:AbortSignal.timeout(5000)}).catch(()=>{});
}
