/** Rank title matches while keeping equipment and movement variants distinct. */
export function bestExerciseReference<T extends { title: string }>(name: string, candidates: T[], aliases: string[] = []): T | undefined {
  const tokens = (value: string) => value.toLowerCase().replace(/&(?:amp|quot|#39);/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(w => !['exercise', 'exercises', 'gif', 'by', 'the', 'a'].includes(w));
  const variants = ['barbell', 'dumbbell', 'kettlebell', 'cable', 'machine', 'seated', 'standing', 'incline', 'decline', 'reverse'];
  const names = [name, ...aliases].map(tokens).filter(t => t.length);
  return candidates.map((candidate, index) => {
    const title = tokens(candidate.title || '');
    const score = Math.max(...names.map(words => {
      if (!words.every(w => title.includes(w))) return -1;
      if (variants.some(v => title.includes(v) && !words.includes(v))) return -1;
      return words.length * 100 - (title.length - words.length) + (/tutorial|form|technique|demonstration|guide/i.test(candidate.title) ? 5 : 0);
    }));
    return { candidate, score, index };
  }).filter(r => r.score >= 0).sort((a, b) => b.score - a.score || a.index - b.index)[0]?.candidate;
}
