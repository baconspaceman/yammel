// A stand-in for engine/seed_engine.py used by the unit tests of src/main/engine.ts.
// It speaks the same line protocol and misbehaves on demand through the game name:
//   "Crash Game"  -> the process exits without answering
//   "Hang Game"   -> never answers
//   "Chatty Game" -> prints noise on stdout before answering (must be ignored by the client)
//   anything else -> answers with checks = the number of option keys + 10
// Environment: FAKE_READY_DELAY_MS delays the ready event; FAKE_NEVER_READY=1 never sends it;
// FAKE_START_FAIL=text writes text to stderr and exits before ready;
// FAKE_COUNT_FILE appends a line "start <pid>" to that file each time the process starts.
import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

if (process.env.FAKE_COUNT_FILE) appendFileSync(process.env.FAKE_COUNT_FILE, `start ${process.pid}\n`);

if (process.env.FAKE_START_FAIL) {
  // Dies before saying it is ready, after writing the reason where a real Python would: on stderr.
  process.stderr.write(`${process.env.FAKE_START_FAIL}\n`);
  process.exit(1);
}

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

if (process.env.FAKE_NEVER_READY !== '1') {
  setTimeout(() => send({ event: 'ready', apVersion: '0.0.0-fake', games: 3 }), Number(process.env.FAKE_READY_DELAY_MS ?? 0));
}

const lines = createInterface({ input: process.stdin });
lines.on('line', (line) => {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    send({ id: null, ok: false, error: 'bad_json' });
    return;
  }
  if (request.op === 'quit') {
    send({ id: request.id, ok: true });
    process.exit(0);
  }
  if (request.game === 'Crash Game') process.exit(3);
  if (request.game === 'Hang Game') return;
  if (request.game === 'Chatty Game') process.stdout.write('some world printed this line\n');
  if (request.game === 'Broken Game') {
    send({ id: request.id, ok: false, error: 'world_error', detail: 'KeyError: boom' });
    return;
  }
  send({
    id: request.id,
    ok: true,
    checks: Object.keys(request.options ?? {}).length + 10,
    items: 5,
    unresolved: [],
    invalid: [],
    ms: 1,
  });
});
lines.on('close', () => process.exit(0));
