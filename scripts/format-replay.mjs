import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { deepStrictEqual } from 'node:assert';

const [input, output, option] = process.argv.slice(2);
if (!input || !output || option && option !== '--expand') {
  console.error('Usage: npm run format:replay -- input.json output.json [--expand]');
  process.exitCode = 1;
} else {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true } });
  try {
    const { readHumanReplay } = await server.ssrLoadModule('/src/game/replay.ts');
    const { stringifyHumanReplay } = await server.ssrLoadModule('/src/game/replay-codec.ts');
    const source = await readFile(input, 'utf8'), replay = readHumanReplay(JSON.parse(source));
    const result = option === '--expand' ? JSON.stringify(replay, null, 2) + '\n' : stringifyHumanReplay(replay) + '\n';
    // Validate losslessness before replacing even an in-place input file.
    deepStrictEqual(readHumanReplay(JSON.parse(result)), replay, 'Replay conversion changed data');
    await writeFile(output, result);
    console.log(`${Buffer.byteLength(source)} → ${Buffer.byteLength(result)} bytes; ${replay.sessions.length} attempts preserved`);
  } finally { await server.close(); }
}
