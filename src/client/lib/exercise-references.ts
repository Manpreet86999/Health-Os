import { invokeCloud } from './cloud-session';
export async function testExerciseMedia(_provider: 'youtube'): Promise<string> {
  const result = await invokeCloud('body-os-ai', { action: '/media/config' });
  if (!result.youtubeConfigured) throw new Error('The app administrator needs to configure YouTube.');
  return 'YouTube is configured for all users. Saved guides are reused from the community library.';
}
