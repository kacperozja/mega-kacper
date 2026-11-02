import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest } from './types.js';

type LogLine = {
  at: string;
  job: string;
  status: 'ok' | 'retry' | 'fail';
  owner: string | null;
  error?: string;
};

function parseLine(line: string): LogLine | null {
  try {
    const obj = JSON.parse(line) as LogLine;
    if (!obj.at || !obj.job || !obj.status) return null;
    return obj;
  } catch {
    return null;
  }
}

export function readNight(runsDir: string, night: string): NightDigest | null {
  const file = join(runsDir, `${night}.jsonl`);
  if (!existsSync(file)) return null;

  const content = readFileSync(file, 'utf8').trim();
  if (!content) return { night, rows: [], badLines: 0 };

  const lines = content.split('\n');
  const jobs = new Map<string, DigestRow>();
  let badLines = 0;

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) {
      badLines++;
      continue;
    }

    const existing = jobs.get(parsed.job);
    if (existing) {
      existing.runs++;
      if (parsed.status === 'retry') existing.retries++;
      existing.lastStatus = parsed.status;
      existing.lastError = parsed.error ?? null;
      existing.lastTime = parsed.at;
    } else {
      jobs.set(parsed.job, {
        job: parsed.job,
        owner: parsed.owner ?? null,
        runs: 1,
        retries: parsed.status === 'retry' ? 1 : 0,
        lastStatus: parsed.status,
        lastError: parsed.error ?? null,
        firstTime: parsed.at,
        lastTime: parsed.at,
      });
    }
  }

  const rows = [...jobs.values()].sort((a, b) => a.job.localeCompare(b.job));
  return { night, rows, badLines };
}
