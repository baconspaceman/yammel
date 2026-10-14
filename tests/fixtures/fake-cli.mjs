// A stand-in for "claude" and "codex" in tests. FAKE_MODE picks what it does; it reads all of standard input first.
import { writeFileSync } from 'node:fs';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  const mode = process.env['FAKE_MODE'] ?? 'claude-ok';
  const args = process.argv.slice(2);
  const reply = { message: 'hello', edits: [], followUps: [] };
  if (mode === 'claude-ok') {
    process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: '', structured_output: { ...reply, echoedArgs: args, echoedInputLength: input.length, sawApiKey: process.env['ANTHROPIC_API_KEY'] ?? null } }));
  } else if (mode === 'claude-text') {
    process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: 'Sure: ' + JSON.stringify(reply) }));
  } else if (mode === 'claude-auth') {
    process.stdout.write(JSON.stringify({ type: 'result', is_error: true, result: 'Failed to authenticate: OAuth session expired' }));
  } else if (mode === 'claude-limit') {
    process.stdout.write(JSON.stringify({ type: 'result', is_error: true, result: 'Usage limit reached' }));
  } else if (mode === 'codex-ok') {
    const out = args[args.indexOf('-o') + 1];
    writeFileSync(out, JSON.stringify({ ...reply, echoedArgs: args, echoedInput: input.slice(0, 80), sawApiKey: process.env['OPENAI_API_KEY'] ?? null }));
  } else if (mode === 'codex-fail') {
    process.stderr.write('Error: not logged in. Please run codex login');
    process.exitCode = 1;
  } else if (mode === 'hang') {
    setTimeout(() => undefined, 60_000);
    return;
  } else if (mode === 'flood') {
    process.stdout.write('x'.repeat(5000));
  } else if (mode === 'garbage') {
    process.stdout.write('not json at all');
  }
});
