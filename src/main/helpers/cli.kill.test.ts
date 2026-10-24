import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanEnv, runCli } from './cli';

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Stopping a tree runs taskkill in the background, so it may take a moment (longer when the machine is busy). */
async function stoppedWithin(pid: number, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (alive(pid) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 200));
  return !alive(pid);
}

describe('stopping a program also stops what it started', () => {
  it('a timeout ends a launcher and the program it launched (as a Python launcher does on Windows)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kill-'));
    const pidFile = join(dir, 'child.pid');
    const grandchild = 'setInterval(()=>{},1000)';
    const parent = `const {spawn}=require("child_process");const fs=require("fs");const c=spawn(process.execPath,["-e",${JSON.stringify(grandchild)}],{stdio:"ignore"});fs.writeFileSync(${JSON.stringify(pidFile)},String(c.pid));setInterval(()=>{},1000)`;
    const run = await runCli({ command: process.execPath, args: ['-e', parent], cwd: process.cwd(), env: cleanEnv(process.env), timeoutMs: 1500 });
    expect(run).toMatchObject({ ok: false, reason: 'timeout' });
    const pid = Number(await readFile(pidFile, 'utf8'));
    expect(await stoppedWithin(pid, 15_000)).toBe(true);
    await rm(dir, { recursive: true, force: true });
  }, 40_000);

  it('an abort signal stops the run at once and says it was stopped', async () => {
    const controller = new AbortController();
    const started = runCli({ command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], cwd: process.cwd(), env: cleanEnv(process.env), timeoutMs: 30_000, signal: controller.signal });
    setTimeout(() => controller.abort(), 300);
    expect(await started).toMatchObject({ ok: false, reason: 'aborted' });
    const already = new AbortController();
    already.abort();
    expect(await runCli({ command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], cwd: process.cwd(), env: cleanEnv(process.env), timeoutMs: 30_000, signal: already.signal })).toMatchObject({ reason: 'aborted' });
  }, 20_000);
});
