import { getEnv, logReport, toNumber } from './common.mjs';
import { runOrchestrator } from './orchestrator.mjs';

const loopDelayMs = toNumber(getEnv('ULTRA_LOOP_DELAY_MS', '30000'), 30000);
const nonStop = getEnv('ULTRA_LOOP_NON_STOP', 'true') !== 'false';

async function runCycle(cycle) {
  const result = await runOrchestrator({ title: `Continuous loop cycle ${cycle}` });
  const failed = result.artifacts.filter((item) => item.status === 'failed');
  logReport('continuous_loop_cycle', {
    cycle,
    state: result.state,
    failed_agents: failed.map((item) => item.agent),
    artifacts: result.artifacts,
    passed: failed.length === 0,
  });
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
