// Writes the sample student shown on the Insights page to data/, as CSV.
//   node analysis/export-sample.mjs
import { writeFileSync } from 'node:fs';
import { sessionTable, toCSV } from '../js/insights.js';
import { sampleSessions } from '../js/simulate.js';

const tables = sessionTable(sampleSessions(new Date(2026, 10, 1).getTime()));
for (const [name, rows] of Object.entries(tables)) {
  writeFileSync(new URL(`../data/sample-${name}.csv`, import.meta.url), toCSV(rows));
  console.log(`data/sample-${name}.csv: ${rows.length - 1} rows`);
}
