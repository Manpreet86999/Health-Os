import type { AppSettings } from '../../shared/types.js';
import * as repo from '../db/repository.js';

export interface TavilySource {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface TavilySearchResult {
  query: string;
  sources: TavilySource[];
  searchCount: number;
  searchMonth: string;
}

const TAVILY_SEARCH_URL = 'https://api.tavily.com/search';
const MAX_QUERY_LENGTH = 500;
const MAX_SOURCES = 5;
const MAX_CONTENT_PER_SOURCE = 1_200;

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function recordSearch(settings: AppSettings): { searchCount: number; searchMonth: string } {
  const searchMonth = currentMonth();
  const searchCount = settings.tavilySearchMonth === searchMonth
    ? Number(settings.tavilySearchCount || 0) + 1
    : 1;
  repo.saveSettings({ tavilySearchCount: searchCount, tavilySearchMonth: searchMonth });
  return { searchCount, searchMonth };
}

/** Searches only the explicit user query. Personal records are never sent to Tavily. */
export async function tavilySearch(settings: AppSettings, query: string): Promise<TavilySearchResult> {
  const cleaned = String(query || '').trim().slice(0, MAX_QUERY_LENGTH);
  if (cleaned.length < 3) throw new Error('Enter a more specific web search.');
  if (!settings.tavilyApiKey) throw new Error('Add a Tavily API key in Settings before searching the web.');

  const response = await fetch(TAVILY_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: settings.tavilyApiKey,
      query: cleaned,
      search_depth: 'basic',
      max_results: MAX_SOURCES,
      include_answer: false,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({})) as {
    detail?: string;
    message?: string;
    results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
  };
  if (!response.ok) {
    throw new Error(payload.detail || payload.message || 'Tavily search failed. Check the API key and available credits.');
  }

  const sources = (payload.results || [])
    .filter((result) => typeof result.url === 'string' && result.url.startsWith('http'))
    .slice(0, MAX_SOURCES)
    .map((result) => ({
      title: String(result.title || result.url || 'Untitled source').slice(0, 240),
      url: String(result.url),
      content: String(result.content || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CONTENT_PER_SOURCE),
      score: typeof result.score === 'number' ? result.score : undefined,
    }));
  const usage = recordSearch(settings);
  return { query: cleaned, sources, ...usage };
}

/** Fetch HTTPS page text through Tavily from search results or a user-supplied product link. */
export async function tavilyExtract(settings: AppSettings, urls: string[]): Promise<TavilySource[]> {
  if (!settings.tavilyApiKey || !urls.length) return [];
  const selected = urls.filter(url => { try { const parsed = new URL(url); return parsed.protocol === 'https:'; } catch { return false; } }).slice(0, 3);
  if (!selected.length) return [];
  const response = await fetch('https://api.tavily.com/extract', {
    method:'POST', headers:{'Authorization':`Bearer ${settings.tavilyApiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({urls:selected,extract_depth:'basic',format:'markdown',include_images:false}),
    signal:AbortSignal.timeout(20000),
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(()=>({})) as {results?:Array<{url:string;raw_content:string}>};
  return (payload.results || []).filter(result => selected.includes(result.url) && result.raw_content).map(result => ({url:result.url,title:result.url,content:String(result.raw_content).slice(0,5000)}));
}
