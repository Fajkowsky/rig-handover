import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunStatus, StatusCounts } from './types.js';

type RunLine = { at: string; job: string; status: RunStatus; owner: string | null; error: string | null };

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v !== '';

const isStatus = (v: unknown): v is RunStatus => v === 'ok' || v === 'retry' || v === 'fail';

function parseLine(text: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { at, job, status, owner, error } = value as Record<string, unknown>;
  if (!isNonEmptyString(at) || !isNonEmptyString(job) || !isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  return { at, job, status, owner, error: error ?? null };
}

function toRow(job: string, lines: RunLine[]): DigestRow {
  const first = lines[0];
  const last = lines[lines.length - 1];
  return {
    job,
    owner: last.owner,
    runs: lines.length,
    retries: lines.filter((l) => l.status === 'retry').length,
    lastStatus: last.status,
    lastError: lines.findLast((l) => l.error !== null)?.error ?? null,
    firstAt: first.at,
    lastAt: last.at,
  };
}

const byJob = (a: DigestRow, b: DigestRow): number => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0);

function readLog(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return null;
    throw e;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  const text = readLog(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const linesByJob = new Map<string, RunLine[]>();
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines++;
      continue;
    }
    counts[line.status]++;
    linesByJob.set(line.job, [...(linesByJob.get(line.job) ?? []), line]);
  }

  const rows = [...linesByJob].map(([job, lines]) => toRow(job, lines)).sort(byJob);
  return { night, rows, counts, badLines };
};
