import { AppDb, Measurement } from '../../shared/types.js';
import { id } from '../lib/ids.js';

export function getGoogleAuthUrl(clientId: string, redirectUri: string): string {
  const scopes = [
    'https://www.googleapis.com/auth/fitness.body.read',
    'https://www.googleapis.com/auth/fitness.activity.read',
    'https://www.googleapis.com/auth/fitness.activity.write',
    'https://www.googleapis.com/auth/fitness.sleep.read',
    'https://www.googleapis.com/auth/fitness.heart_rate.read',
  ].join(' ');
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    // Request a long-lived token every time a user deliberately connects Fit.
    prompt: 'consent select_account',
    include_granted_scopes: 'false',
  });
  
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(clientId: string, clientSecret: string, code: string, redirectUri: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    }).toString()
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange token: ${error}`);
  }
  
  return response.json();
}

export async function refreshGoogleToken(clientId: string, clientSecret: string, refreshToken: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    }).toString()
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }
  
  return response.json();
}

type GoogleFitDataSource = {
  dataStreamId: string;
  dataType?: { name?: string };
  type?: 'raw' | 'derived';
};

/** Resolve the stream ID at sync time because it varies by app and device. */
export async function findGoogleFitDataSource(accessToken: string, dataTypeName: string): Promise<string | null> {
  const response = await fetch('https://www.googleapis.com/fitness/v1/users/me/dataSources', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    console.error(`Failed to discover Google Fit data sources for ${dataTypeName}:`, await response.text());
    return null;
  }

  const payload = await response.json() as { dataSource?: GoogleFitDataSource[] };
  const matches = (payload.dataSource ?? []).filter((source) => source.dataType?.name === dataTypeName);
  if (matches.length === 0) return null;

  // A derived stream is Google's consolidated view, so avoid duplicate raw samples.
  return (matches.find((source) => source.type === 'derived') ?? matches[0]).dataStreamId;
}

export async function fetchGoogleFitData(accessToken: string, startTimeNs: number, endTimeNs: number, dataSourceId: string) {
  const datasetId = `${startTimeNs}-${endTimeNs}`;
  const url = `https://www.googleapis.com/fitness/v1/users/me/dataSources/${encodeURIComponent(dataSourceId)}/datasets/${datasetId}`;
  
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  
  if (!response.ok) {
    console.error(`Failed to fetch ${dataSourceId} from Google Fit:`, await response.text());
    return null; // Return null instead of throwing to allow partial syncs
  }
  
  return response.json();
}

export async function fetchGoogleFitDataByType(accessToken: string, startTimeNs: number, endTimeNs: number, dataTypeName: string) {
  const dataSourceId = await findGoogleFitDataSource(accessToken, dataTypeName);
  if (!dataSourceId) return null;
  return fetchGoogleFitData(accessToken, startTimeNs, endTimeNs, dataSourceId);
}

/** Google Fit records overnight sleep as a session. Sessions are returned by end time. */
export async function fetchGoogleFitSleepSessions(accessToken: string, startTimeMillis: number, endTimeMillis: number) {
  const params = new URLSearchParams({
    startTime: new Date(startTimeMillis).toISOString(),
    endTime: new Date(endTimeMillis).toISOString(),
    activityType: '72', // Google Fit SLEEP activity type
  });
  const response = await fetch(`https://www.googleapis.com/fitness/v1/users/me/sessions?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    console.error('Failed to retrieve Google Fit sleep sessions:', await response.text());
    return null;
  }
  return response.json() as Promise<{ session?: Array<{ startTimeMillis: string; endTimeMillis: string; activityType?: number }> }>;
}

export async function aggregateGoogleFitData(accessToken: string, startTimeMillis: number, endTimeMillis: number, dataTypeName: string) {
  const url = `https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`;
  const body = {
    aggregateBy: [{ dataTypeName }],
    bucketByTime: { durationMillis: 86400000 },
    startTimeMillis,
    endTimeMillis
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    console.error(`Failed to aggregate ${dataTypeName} from Google Fit:`, await response.text());
    return null;
  }
  
  return response.json();
}

export async function fetchGoogleFitWeight(accessToken: string, startTimeNs: number, endTimeNs: number) {
  return fetchGoogleFitDataByType(accessToken, startTimeNs, endTimeNs, 'com.google.weight');
}

export async function pushGoogleFitWorkout(
  accessToken: string,
  session: { id: string; name: string; startTimeMs: number; endTimeMs: number; type: 'weightlifting' | 'cardio'; notes?: string }
) {
  const url = `https://www.googleapis.com/fitness/v1/users/me/sessions/${session.id}`;
  
  // 97 = Weightlifting, 8 = Running, 82 = Walking, 1 = Biking, 114 = HIIT
  let activityType = 97; 
  if (session.type === 'cardio') activityType = 8; // simplified fallback
  
  const body = {
    id: session.id,
    name: session.name,
    description: session.notes || '',
    startTimeMillis: session.startTimeMs,
    endTimeMillis: session.endTimeMs,
    activityType,
    application: {
      name: 'Health OS'
    }
  };
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to push workout to Google Fit: ${error}`);
  }
  
  return response.json();
}
