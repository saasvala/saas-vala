export const AGENT_SEQUENCE = [
  'SCAN_AI',
  'DEBUG_AI',
  'DEV_AI',
  'SECURITY_AI',
  'OPTIMIZE_AI',
  'BUILD_AI',
];

export const MODEL_PRIORITY = [
  'openai_gpt',
  'claude',
  'gemini',
];

export const FIX_STRATEGIES = [
  'focused_patch',
  'dependency_refresh',
  'runtime_stabilize',
  'permission_repair',
  'clean_rebuild',
];

export const SELF_HEAL_FLOW = [
  { stage: 'SCAN', agent: 'SCAN_AI', state: 'scanning' },
  { stage: 'DEBUG', agent: 'DEBUG_AI', state: 'debugging' },
  { stage: 'DEV', agent: 'DEV_AI', state: 'developing' },
  { stage: 'SCAN_AGAIN', agent: 'SCAN_AI', state: 'scanning' },
  { stage: 'SECURITY', agent: 'SECURITY_AI', state: 'scanning' },
  { stage: 'OPTIMIZE', agent: 'OPTIMIZE_AI', state: 'developing' },
  { stage: 'BUILD', agent: 'BUILD_AI', state: 'building' },
  { stage: 'VERIFY', agent: 'BUILD_AI', state: 'verifying' },
];

export const RUN_STATES = Object.freeze({
  PENDING: 'pending',
  QUEUED: 'queued',
  RUNNING: 'running',
  SCANNING: 'scanning',
  DEBUGGING: 'debugging',
  DEVELOPING: 'developing',
  BUILDING: 'building',
  VERIFYING: 'verifying',
  READY: 'ready',
  SUCCESS: 'success',
  FAILED: 'failed',
  RETRYING: 'retrying',
  SKIPPED: 'skipped',
});

export const FAILURE_TYPES = Object.freeze({
  SYNTAX_ERROR: 'syntax_error',
  DEPENDENCY_MISSING: 'dependency_missing',
  RUNTIME_CRASH: 'runtime_crash',
  PERMISSION_ISSUE: 'permission_issue',
  COMMAND_FAILED: 'command_failed',
  VALIDATION_FAILED: 'validation_failed',
  TIMEOUT: 'timeout',
  UNKNOWN: 'unknown',
});

export function createTaskEnvelope(input = {}) {
  return {
    version: 'apk_self_heal_v2',
    task_id: input.task_id || `task-${Date.now()}`,
    requested_at: input.requested_at || new Date().toISOString(),
    request: {
      title: input.title || 'APK Self-Healing Factory Task',
      prompt: input.prompt || 'Run autonomous multi-agent APK healing cycle',
      target_outputs: Array.isArray(input.target_outputs) ? input.target_outputs : ['apk'],
    },
    retries: {
      max_agent_retries: Number.isFinite(Number(input.max_agent_retries))
        ? Number(input.max_agent_retries)
        : 2,
      max_heal_loops: Number.isFinite(Number(input.max_heal_loops))
        ? Number(input.max_heal_loops)
        : 5,
    },
    ai_routing: {
      model_priority: Array.isArray(input.model_priority) && input.model_priority.length > 0
        ? input.model_priority
        : MODEL_PRIORITY,
      fallback_enabled: input.fallback_enabled !== false,
      fix_strategies: Array.isArray(input.fix_strategies) && input.fix_strategies.length > 0
        ? input.fix_strategies
        : FIX_STRATEGIES,
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
