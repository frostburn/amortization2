import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Explicit local inspection, separate from npm test and the CI workflow.
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
  'run', '--maxWorkers=1', '--testNamePattern=long replay:', ...process.argv.slice(2),
], { stdio: 'inherit', env: { ...process.env, AMORTIZATION2_LONG_REPLAYS: '1' } });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
