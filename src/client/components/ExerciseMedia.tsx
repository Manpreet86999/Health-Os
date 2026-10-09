import { selectExerciseMedia, type ExerciseMedia as Media } from '../../shared/global-exercises';
import { youtubeVideoId } from '../../shared/youtube';

export function ExerciseMedia({ media = [], name }: { media?: Media[]; name: string }) {
  const tutorial = selectExerciseMedia(media, 'tutorial');
  const id = youtubeVideoId(tutorial?.url) || youtubeVideoId(tutorial?.embed_url);
  return <div className="stack" style={{ marginBottom: 20 }}>
    {id ? <><iframe key={id} title={`${name} tutorial`} src={`https://www.youtube-nocookie.com/embed/${id}`} allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" style={{ width: '100%', aspectRatio: '16/9', border: 0, borderRadius: 12 }} /><a href={`https://www.youtube.com/watch?v=${id}`} target="_blank" rel="noreferrer">Open on YouTube</a></> : <p className="subtle">No video saved yet. Add a YouTube guide below to share it with everyone.</p>}
  </div>;
}
