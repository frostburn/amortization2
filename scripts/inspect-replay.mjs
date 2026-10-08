import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const filename = process.argv[2];
if (!filename) {
  console.error('Usage: npm run inspect:replay -- /path/to/amortization2-replay.json');
  process.exitCode = 1;
} else {
  const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), server: { middlewareMode: true } });
  try {
    const { readHumanReplay, playRecordedSession } = await server.ssrLoadModule('/src/game/replay.ts');
    const { Simulation } = await server.ssrLoadModule('/src/game/simulation.ts');
    const replay = readHumanReplay(JSON.parse(await readFile(filename, 'utf8')));
    console.log(`Capture: ${replay.revision} · ${replay.sessions.length} attempts / floors · ${replay.createdAt}`);
    if (replay.stopReason) console.log(`Partial capture: ${replay.stopReason}`);
    for (const [i, session] of replay.sessions.entries()) {
      const observed = session.final;
      const deaths = session.events.filter(e => e.data.type === 'down').map(e => ({ seconds: +(e.tick * replay.step).toFixed(2), actor: e.data.actor }));
      const shots = session.events.filter(e => e.data.type === 'shot');
      const commands = {};
      for (const input of session.inputs) commands[input.data.type] = (commands[input.data.type] ?? 0) + 1;
      let checked;
      const sim = await Simulation.create(session.range, session.fourthModel);
      try {
        const played = playRecordedSession(sim, session);
        const differences = [];
        for (const key of ['shots', 'hits', 'throws']) if (played[key] !== observed[key]) differences.push(key);
        if (played.mission?.phase !== observed.mission?.phase || played.arena?.phase !== observed.arena?.phase) differences.push('phase');
        for (const actor of observed.actors) {
          const actual = played.actors.find(a => a.id === actor.id);
          if (!actual || actual.hp !== actor.hp || actual.ammo !== actor.ammo || actual.weapon !== actor.weapon ||
              Math.hypot(actual.position.x - actor.position.x, actual.position.y - actor.position.y, actual.position.z - actor.position.z) > .02)
            differences.push(`actor ${actor.id}`);
        }
        checked = differences.length ? `DIVERGED: ${differences.join(', ')}. Use recorded observations; source/physics versions may differ.`
          : 'Commands reproduce recorded combat and actor positions (within 2 cm).';
      } catch (error) { checked = `Cannot re-simulate: ${error.message}. Recorded observations remain available.`; }
      finally { sim.world.free(); }
      console.log(JSON.stringify({ attempt: i + 1, range: session.range, seconds: +(session.endTick * replay.step).toFixed(2),
        outcome: observed.mission?.phase ?? observed.arena?.phase ?? 'range',
        players: observed.actors.filter(a => a.kind === 'player').map(a => ({ id: a.id, hp: a.hp, ammo: a.ammo, position: a.position })),
        shots: observed.shots, hits: observed.hits, throws: observed.throws, deaths,
        shotsByActor: Object.fromEntries([...new Set(shots.map(e => e.data.actor))].map(id => [id, shots.filter(e => e.data.actor === id).length])),
        commands, cameraSamples: session.views.length, snapshots: session.snapshots.length, verification: checked }, null, 2));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { await server.close(); }
}
