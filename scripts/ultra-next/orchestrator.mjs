import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { AGENT_SEQUENCE, FAILURE_TYPES, RUN_STATES, createAgentArtifact, createTaskEnvelope } from './orchestration-contracts.mjs';
import { getEnv, logReport, toNumber } from './common.mjs';

const agentRetries = toNumber(getEnv('ORCH_AGENT_RETRIES', '1'), 1);

function runCommand(command, args) {
  return new Promise((resolve) => {
    let settled = false;
    const complete = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const child = spawn(command, args, { stdio: 'inherit', shell: false });
    child.on('error', () => complete(1));
    child.on('close', (code) => complete(code || 0));
  });
}

async function executeAgent(agent, context) {
  const commandsByAgent = {
    AI_PLANNER: [['npm', ['run', 'ultra:detect']]],
    AI_ARCHITECT: [],
    AI_UI_BUILDER: [],
    AI_BACKEND_DEV: [],
    AI_DB_ENGINEER: [['npm', ['run', 'test:db']]],
    AI_INTEGRATOR: [['npm', ['run', 'test:api']]],
    AI_DEBUGGER: [['npm', ['run', 'ultra:fix']]],
    AI_TESTER: [['npm', ['run', 'ultra:retest']]],
    AI_OPTIMIZER: [['npm', ['run', 'perf:test']]],
    AI_DEPLOYER: [['npm', ['run', 'build']]],
  };

  const commands = commandsByAgent[agent] || [];
  if (commands.length === 0) {
    return createAgentArtifact(agent, RUN_STATES.SKIPPED, { reason: 'phase1_placeholder' });
  }

  const attempts = Math.max(1, context.retries.max_agent_retries || agentRetries);
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const results = [];
    let failed = false;

    for (const [command, args] of commands) {
      const code = await runCommand(command, args);
      const entry = { command: `${command} ${args.join(' ')}`, code, attempt };
      results.push(entry);
      if (code !== 0) failed = true;
    }

    if (!failed) {
      return createAgentArtifact(agent, RUN_STATES.SUCCESS, { attempt, commands: results });
    }

    if (attempt < attempts) {
      logReport('orchestrator_retry', { agent, state: RUN_STATES.RETRYING, attempt, attempts });
    } else {
      return createAgentArtifact(agent, RUN_STATES.FAILED, {
        failure_type: FAILURE_TYPES.COMMAND_FAILED,
        attempt,
        attempts,
        commands: results,
      });
    }
  }

  return createAgentArtifact(agent, RUN_STATES.FAILED, { failure_type: FAILURE_TYPES.UNKNOWN });
}

export async function runOrchestrator(input = {}) {
  const task = createTaskEnvelope(input);
  const startedAt = new Date().toISOString();
  const artifacts = [];
  let runState = RUN_STATES.RUNNING;

  logReport('orchestrator_start', { task, state: runState });

  for (const agent of AGENT_SEQUENCE) {
    const artifact = await executeAgent(agent, task);
    artifacts.push(artifact);

    if (artifact.status === RUN_STATES.FAILED) {
      runState = RUN_STATES.FAILED;
      break;
    }
  }

  if (runState !== RUN_STATES.FAILED) {
    runState = RUN_STATES.SUCCESS;
  }

  const endedAt = new Date().toISOString();
  const report = { task_id: task.task_id, startedAt, endedAt, state: runState, artifacts };
  logReport('orchestrator_end', report);

  if (runState !== RUN_STATES.SUCCESS) process.exitCode = 1;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runOrchestrator();
}
