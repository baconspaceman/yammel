// A stand-in for Archipelago's Generate.py in tests. FAKE_GEN picks what it does.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const get = (name) => args[args.indexOf(name) + 1];
const players = get('--player_files_path');
const out = get('--outputpath');
const skip = args.includes('--skip_output');
const mode = process.env['FAKE_GEN'] ?? 'ok';

if (mode !== 'silent') process.stdout.write('Archipelago 0.6.7 Version\nLoading worlds...\n');
process.stdin.resume();
process.stdin.on('data', () => undefined);
process.stdin.on('end', () => {
  const files = readdirSync(players);
  if (mode === 'ok') {
    process.stdout.write(`Players: ${files.join(', ')}\nFilling the multiworld.\n`);
    process.stdout.write(`TEXTS ${files.map((f) => readFileSync(join(players, f), 'utf8').split('\n')[0]).join('|')}\n`);
    process.stdout.write(`ARGS ${JSON.stringify(args)}\n`);
    if (skip) {
      process.stdout.write('Done. Skipped output/spoiler generation. Total Time: 0.01\n');
    } else {
      writeFileSync(join(out, 'AP_123.zip'), 'zip');
      if (process.env['FAKE_SPOILER'] === '1') writeFileSync(join(out, 'AP_123_Spoiler.txt'), 'spoiler');
      process.stdout.write('Done. Enjoy. Total Time: 0.02\n');
    }
  } else if (mode === 'invalid') {
    process.stderr.write(
      'Options.OptionError: Error generating option hard_mode in APQuest\nTraceback (most recent call last):\n  File "Generate.py", line 664, in <module>\nValueError: Encountered 1 error(s) in player files.\n\n1. File t.yaml document #1 (name: Tester) is invalid. Please fix your yaml.\nOptions.OptionError: Option HardMode does not support a value of ture\n Which caused: Options.OptionError: Error generating option hard_mode in APQuest\nPress enter to close.',
    );
    process.exitCode = 1;
  } else if (mode === 'fill') {
    process.stderr.write('Traceback (most recent call last):\n  File "Fill.py", line 5\nFillError: No more spots to place 3 items. Remaining locations are invalid.\n');
    process.exitCode = 1;
  } else if (mode === 'nozip') {
    process.stdout.write('Done. Enjoy.\n');
  } else if (mode === 'silent') {
    process.exitCode = 2;
  } else if (mode === 'hang') {
    setTimeout(() => undefined, 60_000);
  }
});
