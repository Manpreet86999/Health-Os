/** Counts require a sets label or a sets × reps/time prescription, never bare reps/seconds. */
export function prescriptionSetCount(volume:unknown):number{
 const text=String(volume??'').trim();
 const explicit=/\b(\d+)\s*(?:sets?|rounds?)\b/i.exec(text);
 const reversed=/\d+(?:\.\d+)?\s*(?:reps?|s|sec(?:onds?)?|m|min(?:utes?)?)\s*[x×✕*]\s*(\d+)\b/i.exec(text);
 const multiplied=/(\d+)\s*[x×✕*]\s*\d+/i.exec(text);
 const value=Number(explicit?.[1]??reversed?.[1]??multiplied?.[1]??3);
 return Number.isInteger(value)&&value>=1&&value<=100?value:3;
}

/** Repair only the known parser inflation; never discard a confirmed set or an added warm-up. */
export function repairedSetCardCount(volume:string,slots:number,confirmed:number[],warmups=0):number{
 const planned=prescriptionSetCount(volume),legacy=Math.max(1,parseInt(String(volume).split(/x/i)[0],10)||3);
 if(legacy<=planned||!(slots===legacy||slots===legacy+warmups))return slots;
 return Math.max(planned+warmups,...confirmed.map(index=>index+1));
}
