import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const tmpRuns = join(import.meta.dirname, '__tmp_runs__');

const goodLines = [
  '{"at":"2026-10-28T23:00:02+01:00","job":"alpha","status":"ok","owner":"lane-07"}',
  '{"at":"2026-10-29T01:00:00+01:00","job":"beta","status":"retry","owner":"rook","error":"timeout"}',
  '{"at":"2026-10-29T02:00:00+01:00","job":"beta","status":"ok","owner":"rook"}',
];

beforeAll(() => {
  mkdirSync(tmpRuns, { recursive: true });
  writeFileSync(join(tmpRuns, '2026-10-28.jsonl'), goodLines.join('\n') + '\n');
  writeFileSync(join(tmpRuns, '2026-10-29.jsonl'), '');
  writeFileSync(
    join(tmpRuns, '2026-10-30.jsonl'),
    goodLines[0] + '\nthis is not json\n' + goodLines[1] + '\n',
  );
});

afterAll(() => {
  rmSync(tmpRuns, { recursive: true, force: true });
});

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: tmpRuns };

describe('digest page', () => {
  it('renders 200 for a night with data', async () => {
    const res = await createApp(config).request('/digest/2026-10-28');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('alpha');
    expect(html).toContain('beta');
  });

  it('returns 404 for a night with no file', async () => {
    const res = await createApp(config).request('/digest/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('renders nothing ran for an empty night', async () => {
    const res = await createApp(config).request('/digest/2026-10-29');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('nothing ran');
  });

  it('renders despite a bad line', async () => {
    const res = await createApp(config).request('/digest/2026-10-30');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('alpha');
    expect(html).toContain('could not be parsed');
  });
});

describe('digest JSON', () => {
  it('returns 200 with rows', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows).toHaveLength(2);
    expect(rows[0].job).toBe('alpha');
    expect(rows[1].job).toBe('beta');
  });

  it('returns 404 for a missing night', async () => {
    const res = await createApp(config).request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('returns empty array for an empty night', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-29');
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows).toEqual([]);
  });

  it('returns rows despite a bad line', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-30');
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows).toHaveLength(2);
  });

  it('page and JSON agree on jobs and order', async () => {
    const pageRes = await createApp(config).request('/digest/2026-10-28');
    const pageHtml = await pageRes.text();
    const jsonRes = await createApp(config).request('/api/digest/2026-10-28');
    const rows = (await jsonRes.json()) as Array<{ job: string }>;

    for (const row of rows) {
      expect(pageHtml).toContain(row.job);
    }
  });
});
