import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

function tempRuns(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

describe('readNight', () => {
  it('reads the real night of 2026-10-28', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).toEqual({
      night: '2026-10-28',
      rows: [
        {
          job: 'digest/render',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-29T05:41:09+01:00',
          lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh',
          owner: 'rook',
          runs: 4,
          retries: 3,
          lastStatus: 'ok',
          lastError: 'upstream 503',
          firstAt: '2026-10-29T01:30:00+01:00',
          lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync',
          owner: 'rook',
          runs: 8,
          retries: 1,
          lastStatus: 'ok',
          lastError: 'lock held',
          firstAt: '2026-10-28T23:00:06+01:00',
          lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: 'quota exceeded',
          firstAt: '2026-10-29T04:00:01+01:00',
          lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-28T23:00:02+01:00',
          lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
      counts: { ok: 10, retry: 4, fail: 1 },
      badLines: 1,
    });
  });

  it('returns null when the night has no file', () => {
    expect(readNight(tempRuns(), '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    expect(readNight(tempRuns({ 'x.jsonl': '' }), '../x')).toBeNull();
  });

  it('reads an empty file as an empty night', () => {
    const night = readNight(tempRuns({ '2026-01-01.jsonl': '' }), '2026-01-01');
    expect(night).toEqual({ night: '2026-01-01', rows: [], counts: { ok: 0, retry: 0, fail: 0 }, badLines: 0 });
  });

  it('keeps a null owner and counts a wrong status as a bad line', () => {
    const log = [
      '{"at":"2026-01-01T01:00:00+01:00","job":"a","status":"ok","owner":null}',
      '',
      '{"at":"2026-01-01T02:00:00+01:00","job":"a","status":"done","owner":null}',
    ].join('\r\n');
    const night = readNight(tempRuns({ '2026-01-01.jsonl': log }), '2026-01-01');
    expect(night?.rows.map((r) => [r.job, r.owner, r.runs])).toEqual([['a', null, 1]]);
    expect(night?.badLines).toBe(1);
  });
});
