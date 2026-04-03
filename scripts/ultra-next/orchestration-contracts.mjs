export const AGENT_SEQUENCE = [
  'AI_PLANNER',
  'AI_ARCHITECT',
  'AI_UI_BUILDER',
  'AI_BACKEND_DEV',
  'AI_DB_ENGINEER',
  'AI_INTEGRATOR',
  'AI_DEBUGGER',
  'AI_TESTER',
  'AI_OPTIMIZER',
  'AI_DEPLOYER',
];

export const RUN_STATES = Object.freeze({
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  RETRYING: 'retrying',
  SKIPPED: 'skipped',
});

export const FAILURE_TYPES = Object.freeze({
  COMMAND_FAILED: 'command_failed',
  VALIDATION_FAILED: 'validation_failed',
  TIMEOUT: 'timeout',
  UNKNOWN: 'unknown',
});

export function createTaskEnvelope(input = {}) {
  return {
    version: 'phase1',
    task_id: input.task_id || `task-${Date.now()}`,
    requested_at: input.requested_at || new Date().toISOString(),
    request: {
      title: input.title || 'Ultra Next Orchestrator Task',
      prompt: input.prompt || 'Run autonomous software factory cycle',
      target_outputs: Array.isArray(input.target_outputs) ? input.target_outputs : ['web'],
    },
    retries: {
      max_agent_retries: Number.isFinite(Number(input.max_agent_retries))
        ? Number(input.max_agent_retries)
        : 1,
      max_heal_loops: Number.isFinite(Number(input.max_heal_loops))
        ? Number(input.max_heal_loops)
        : 2,
    },
  };
}

export function createAgentArtifact(agent, status, details = {}) {
  return {
    agent,
    status,
    at: new Date().toISOString(),
    details,
  };
}

