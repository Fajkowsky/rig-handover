// Plan morning-digest § 1. The contract every part of § 2 builds against; the reader lives in
// ./read.ts as `export const readNight: ReadNight`.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job in a night's run log. Times are the log's `at` strings, offset kept.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type StatusCounts = Record<RunStatus, number>;

export type Night = {
  night: string;
  // Sorted by job. The page and the JSON show them in this order, never re-sorted.
  rows: DigestRow[];
  // Runs (log lines) per status, across all jobs.
  counts: StatusCounts;
  // Non-blank lines that did not parse or did not match the line shape.
  badLines: number;
};

// null when `night` is not YYYY-MM-DD or `<runsDir>/<night>.jsonl` does not exist.
export type ReadNight = (runsDir: string, night: string) => Night | null;
