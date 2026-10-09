import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchGoogleFitDataByType, findGoogleFitDataSource } from './googleFit.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('Google Fit source discovery', () => {
  it('chooses a derived stream for the requested data type', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({
      dataSource: [
        { dataStreamId: 'raw:com.google.weight:scale:abc', type: 'raw', dataType: { name: 'com.google.weight' } },
        { dataStreamId: 'derived:com.google.weight:com.example:merged', type: 'derived', dataType: { name: 'com.google.weight' } },
        { dataStreamId: 'raw:com.google.step_count.delta:watch:abc', type: 'raw', dataType: { name: 'com.google.step_count.delta' } }
      ]
    }));

    assert.equal(await findGoogleFitDataSource('token', 'com.google.weight'), 'derived:com.google.weight:com.example:merged');
  });

  it('uses the discovered stream ID when retrieving its dataset', async () => {
    const urls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith('/dataSources')) {
        return new Response(JSON.stringify({
          dataSource: [{ dataStreamId: 'raw:com.google.weight:com.scale:device-1', type: 'raw', dataType: { name: 'com.google.weight' } }]
        }));
      }
      return new Response(JSON.stringify({ point: [] }));
    };

    assert.deepEqual(await fetchGoogleFitDataByType('token', 100, 200, 'com.google.weight'), { point: [] });
    assert.equal(urls.length, 2);
    assert.match(urls[1], /dataSources\/raw%3Acom\.google\.weight%3Acom\.scale%3Adevice-1\/datasets\/100-200$/);
  });

  it('does not request a dataset when no matching stream exists', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ dataSource: [] }));
    };

    assert.equal(await fetchGoogleFitDataByType('token', 100, 200, 'com.google.weight'), null);
    assert.equal(calls, 1);
  });
});