import { spawn } from 'node:child_process';
import { getEnv, logReport, toNumber } from './common.mjs';

const loopDelayMs = toNumber(getEnv('ULTRA_LOOP_DELAY_MS', '30000'), 30000);
const nonStop = getEnv('ULTRA_LOOP_NON_STOP', 'true') !== 'false';

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false });
    child.on('close', (code) => resolve(code || 0));
  });
}

async function runCycle(cycle) {
  const commands = [
    ['npm', ['run', 'ultra:test']],
    ['npm', ['run', 'ultra:detect']],
    ['npm', ['run', 'ultra:fix']],
    ['npm', ['run', 'ultra:retest']],
  ];

  const status = [];
  for (const [command, args] of commands) {
    const code = await runCommand(command, args);
    status.push({ command: `${command} ${args.join(' ')}`, code });
  }

  const failed = status.filter((item) => item.code !== 0);
  logReport('continuous_loop_cycle', { cycle, status, passed: failed.length === 0 });

  return failed.length === 0;
}

async function run() {
  let cycle = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const ok = await runCycle(cycle);

    if (ok) {
      logReport('continuous_loop', {
        message: 'All checks passed and system stable for this cycle',
        cycle,
      });
      if (!nonStop) break;
    }

    cycle += 1;
    await new Promise((resolve) => setTimeout(resolve, loopDelayMs));
  }
}

run();
