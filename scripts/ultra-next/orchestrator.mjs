import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { FAILURE_TYPES, RUN_STATES, SELF_HEAL_FLOW, createAgentArtifact, createTaskEnvelope } from './orchestration-contracts.mjs';
import { getEnv, logReport, toNumber } from './common.mjs';

const agentRetries = toNumber(getEnv('ORCH_AGENT_RETRIES', '1'), 1);

function runCommand(command, args, { capture = false } = {}) {
  return new Promise((resolve) => {
    if (!capture) {
      const child = spawn(command, args, { stdio: 'inherit', shell: false });
      child.once('error', () => resolve({ code: 1, stderr: '' }));
      child.once('close', (code) => resolve({ code: code || 0, stderr: '' }));
      return;
    }

    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'pipe'], shell: false });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk || '');
      process.stderr.write(chunk);
    });
    child.once('error', () => resolve({ code: 1, stderr }));
    child.once('close', (code) => resolve({ code: code || 0, stderr }));
  });
}

function classifyFailure(logText = '', commandText = '') {
  const text = `${logText}\n${commandText}`.toLowerCase();
  if (text.includes('permission denied') || text.includes('eacces') || text.includes('forbidden') || text.includes('unauthorized')) {
    return FAILURE_TYPES.PERMISSION_ISSUE;
  }
  if (text.includes('cannot find module') || text.includes('module not found') || text.includes('missing dependency') || text.includes('not found')) {
    return FAILURE_TYPES.DEPENDENCY_MISSING;
  }
  if (text.includes('unexpected') || text.includes('syntax error') || text.includes('expected') || text.includes('parsing error')) {
    return FAILURE_TYPES.SYNTAX_ERROR;
  }
  if (text.includes('runtime') || text.includes('crash') || text.includes('exception') || text.includes('fatal')) {
    return FAILURE_TYPES.RUNTIME_CRASH;
  }
  return FAILURE_TYPES.COMMAND_FAILED;
}

function autoActionForFailure(failureType) {
  if (failureType === FAILURE_TYPES.SYNTAX_ERROR) return 'fix_syntax';
  if (failureType === FAILURE_TYPES.DEPENDENCY_MISSING) return 'install_dependency';
  if (failureType === FAILURE_TYPES.RUNTIME_CRASH) return 'patch_crash';
  if (failureType === FAILURE_TYPES.PERMISSION_ISSUE) return 'adjust_permission';
  return 'fallback_rebuild';
}

function commandPlanForAgent(agent, stage) {
  const commandsByAgent = {
    SCAN_AI: [['npm', ['run', 'ultra:detect']]],
    DEBUG_AI: [['npm', ['run', 'ultra:fix']]],
    DEV_AI: [['npm', ['run', 'test:db']]],
    SECURITY_AI: [['npm', ['audit', '--audit-level=high']]],
    OPTIMIZE_AI: [['npm', ['run', 'perf:test']]],
    BUILD_AI: stage === 'VERIFY'
      ? [['npm', ['run', 'ultra:retest']]]
      : [['npm', ['run', 'build']]],
  };
  return commandsByAgent[agent] || [];
}

async function executeAgent(step, context) {
  const { agent, stage, state } = step;
  const commands = commandPlanForAgent(agent, stage);
  if (commands.length === 0) {
    return createAgentArtifact(agent, RUN_STATES.SKIPPED, { reason: 'no_commands_defined', stage, state });
  }

  const attempts = Math.max(1, context.retries.max_agent_retries || agentRetries);
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const results = [];
    let failed = false;

    for (const [command, args] of commands) {
      const wantsCapture = stage === 'BUILD' || stage === 'VERIFY' || stage === 'SCAN';
      const run = await runCommand(command, args, { capture: wantsCapture });
      const entry = { command: `${command} ${args.join(' ')}`, code: run.code, attempt };
      results.push(entry);
      if (run.code !== 0) {
        failed = true;
        const failureType = classifyFailure(run.stderr, entry.command);
        entry.failure_type = failureType;
        entry.auto_action = autoActionForFailure(failureType);
      }
    }

    if (!failed) {
      return createAgentArtifact(agent, RUN_STATES.SUCCESS, { stage, state, attempt, commands: results });
    }

    if (attempt < attempts) {
      logReport('orchestrator_retry', { agent, stage, state: RUN_STATES.RETRYING, attempt, attempts });
    } else {
      const firstFailure = results.find((entry) => entry.code !== 0);
      const failureType = firstFailure?.failure_type || FAILURE_TYPES.COMMAND_FAILED;
      return createAgentArtifact(agent, RUN_STATES.FAILED, {
        stage,
        state,
        failure_type: failureType,
        auto_action: autoActionForFailure(failureType),
        attempt,
        attempts,
        commands: results,
      });
    }
  }

  return createAgentArtifact(agent, RUN_STATES.FAILED, { stage, state, failure_type: FAILURE_TYPES.UNKNOWN });
}

export async function runOrchestrator(input = {}) {
  const task = createTaskEnvelope(input);
  const startedAt = new Date().toISOString();
  const artifacts = [];
  let runState = RUN_STATES.QUEUED;
  let activeModelIndex = 0;
  let activeStrategyIndex = 0;
  const fallbackEnabled = task.ai_routing?.fallback_enabled !== false;

  logReport('orchestrator_start', { task, state: runState });
  runState = RUN_STATES.RUNNING;

  let loop = 1;
  let buildSucceeded = false;
  const maxLoops = Math.max(1, Number(task.retries?.max_heal_loops || 5));

  while (loop <= maxLoops && !buildSucceeded) {
    const loopArtifacts = [];
    const activeModel = task.ai_routing?.model_priority?.[activeModelIndex] || 'openai_gpt';
    const activeStrategy = task.ai_routing?.fix_strategies?.[activeStrategyIndex] || 'focused_patch';

    logReport('orchestrator_loop_start', {
      loop,
      max_loops: maxLoops,
      model: activeModel,
      strategy: activeStrategy,
      state: RUN_STATES.RUNNING,
    });

    for (const step of SELF_HEAL_FLOW) {
      const mappedState = RUN_STATES[step.state.toUpperCase()] || RUN_STATES.RUNNING;
      logReport('orchestrator_status', {
        loop,
        stage: step.stage,
        agent: step.agent,
        status: step.state,
        state: mappedState,
      });

      const artifact = await executeAgent(step, task);
      loopArtifacts.push(artifact);
      artifacts.push({
        ...artifact,
        details: {
          ...(artifact.details || {}),
          loop,
          model: activeModel,
          strategy: activeStrategy,
        },
      });

      if (artifact.status === RUN_STATES.FAILED) {
        runState = RUN_STATES.RETRYING;
        break;
      }
    }

    const buildArtifact = loopArtifacts.find(
      (artifact) => artifact.agent === 'BUILD_AI' && artifact.details?.stage === 'BUILD',
    );
    const verifyArtifact = loopArtifacts.find(
      (artifact) => artifact.agent === 'BUILD_AI' && artifact.details?.stage === 'VERIFY',
    );
    buildSucceeded = buildArtifact?.status === RUN_STATES.SUCCESS && verifyArtifact?.status === RUN_STATES.SUCCESS;

    if (buildSucceeded) {
      runState = RUN_STATES.READY;
      logReport('orchestrator_loop_success', {
        loop,
        status: RUN_STATES.READY,
        model: activeModel,
        strategy: activeStrategy,
      });
      break;
    }

    if (!fallbackEnabled) {
      runState = RUN_STATES.FAILED;
      break;
    }

    activeModelIndex = (activeModelIndex + 1) % Math.max(1, task.ai_routing?.model_priority?.length || 1);
    activeStrategyIndex = (activeStrategyIndex + 1) % Math.max(1, task.ai_routing?.fix_strategies?.length || 1);
    loop += 1;
  }

  if (buildSucceeded) {
    runState = RUN_STATES.SUCCESS;
  } else if (runState !== RUN_STATES.FAILED) {
    runState = RUN_STATES.FAILED;
  }

  const endedAt = new Date().toISOString();
  const report = {
    task_id: task.task_id,
    startedAt,
    endedAt,
    state: runState,
    build_ready: buildSucceeded,
    max_loops: maxLoops,
    artifacts,
  };
  logReport('orchestrator_end', report);

  if (!buildSucceeded) {
    logReport('orchestrator_fallback', {
      task_id: task.task_id,
      status: 'failed',
      action: 'notify_admin',
      reason: 'max_loops_exhausted',
    });
  }

  if (runState !== RUN_STATES.SUCCESS) process.exitCode = 1;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runOrchestrator();
}
