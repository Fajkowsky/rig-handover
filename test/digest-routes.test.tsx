import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const line = (job: string, status: string, at: string, extra: object = {}) =>
  JSON.stringify({ job, status, at, ...extra });

const NORMAL = '2026-10-28';
const EMPTY = '2026-10-27';
const BAD = '2026-10-26';
const MISSING = '2026-10-25';

const normalLines = [
  line('sync-billing', 'retry', '2026-10-28T01:00:00+01:00', { owner: 'ana' }),
  line('sync-billing', 'retry', '2026-10-28T01:05:00+01:00', { owner: 'ana' }),
  line('sync-billing', 'retry', '2026-10-28T01:10:00+01:00', { owner: 'ana' }),
  line('sync-billing', 'ok', '2026-10-28T01:15:00+01:00', { owner: 'ana' }),
  line('export-logs', 'fail', '2026-10-28T02:00:00+01:00', { error: 'disk full' }),
  line('backup', 'ok', '2026-10-28T03:00:00+01:00'),
];
const badLines = [
  line('zeta', 'ok', '2026-10-26T01:00:00+01:00'),
  '{"job":"alpha","status":"ok","at":"2026-10-26T02:0',
  '',
  line('alpha', 'ok', '2026-10-26T02:00:00+01:00'),
];

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(runsDir, `${NORMAL}.jsonl`), normalLines.join('\n') + '\n');
  writeFileSync(join(runsDir, `${EMPTY}.jsonl`), '');
  writeFileSync(join(runsDir, `${BAD}.jsonl`), badLines.join('\n') + '\n');
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
});

// Job names in page order: the first cell of each table row.
const jobsInHtml = (html: string) =>
  [...html.matchAll(/<tr[^>]*>\s*<td[^>]*>([^<]+)<\/td>/g)].map((m) => m[1].trim());

const getJson = async (night: string) => {
  const res = await app.request(`/api/digest/${night}`);
  return { res, body: (await res.json()) as Night };
};

describe('digest page', () => {
  it('renders a normal night with one row per job and flags the troubled ones', async () => {
    const res = await app.request(`/digest/${NORMAL}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain(`<h1>digest ${NORMAL}</h1>`);
    expect(html).toContain('<table');
    expect(jobsInHtml(html)).toEqual(['backup', 'export-logs', 'sync-billing']);
    expect(html).not.toContain('bad lines');
    expect(html).not.toContain('nothing ran');
    expect(html.match(/<tr class="warn"/g)).toHaveLength(2);
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('says nothing ran for an empty night and shows no table', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<p class="mute">nothing ran</p>');
    expect(html).not.toContain('<table');
  });

  it('renders a night with a bad line and reports the count', async () => {
    const res = await app.request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<p class="warn">bad lines: 1</p>');
    expect(jobsInHtml(html)).toEqual(['alpha', 'zeta']);
  });
});

describe('digest JSON', () => {
  it('returns the night with rows sorted by job and counts', async () => {
    const { res, body } = await getJson(NORMAL);
    expect(res.status).toBe(200);
    expect(body.night).toBe(NORMAL);
    expect(body.rows.map((r) => r.job)).toEqual(['backup', 'export-logs', 'sync-billing']);
    expect(body.rows.find((r) => r.job === 'sync-billing')?.retries).toBe(3);
    expect(body.rows.find((r) => r.job === 'sync-billing')?.firstAt).toBe('2026-10-28T01:00:00+01:00');
    expect(body.counts).toEqual({ ok: 2, retry: 3, fail: 1 });
    expect(body.badLines).toBe(0);
  });

  it('answers 404 with an error body for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: MISSING });
  });

  it('returns no rows for an empty night', async () => {
    const { res, body } = await getJson(EMPTY);
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts the bad line and still returns the valid rows', async () => {
    const { res, body } = await getJson(BAD);
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha', 'zeta']);
  });
});

describe('digest page and JSON agree', () => {
  it.each([NORMAL, BAD])('list the same jobs in the same order for %s', async (night) => {
    const html = await (await app.request(`/digest/${night}`)).text();
    const { body } = await getJson(night);
    expect(jobsInHtml(html)).toEqual(body.rows.map((r) => r.job));
  });
});
