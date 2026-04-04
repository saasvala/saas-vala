import { describe, expect, it } from 'vitest';
import {
  PIPELINE_ORDER,
  normalizePipelineState,
  nextPipelineState,
  buildPipelineIdempotencyKey,
} from '../../supabase/functions/auto-apk-pipeline/pipeline-shared';

describe('canonical apk pipeline state helpers', () => {
  it('defines required ordered states', () => {
    expect(PIPELINE_ORDER).toEqual([
      'queued',
      'analyzing',
      'fixing',
      'scanning',
      'building',
      'signing',
      'licensing',
      'uploading',
      'marketplace',
      'ready',
    ]);
  });

  it('normalizes valid and invalid state values', () => {
    expect(normalizePipelineState('BUILDING')).toBe('building');
    expect(normalizePipelineState('blocked')).toBe('blocked');
    expect(normalizePipelineState('unknown-stage')).toBe('queued');
    expect(normalizePipelineState('', 'failed')).toBe('failed');
  });

  it('computes next pipeline state and preserves terminal states', () => {
    expect(nextPipelineState('queued')).toBe('analyzing');
    expect(nextPipelineState('signing')).toBe('licensing');
    expect(nextPipelineState('ready')).toBe('ready');
    expect(nextPipelineState('failed')).toBe('failed');
    expect(nextPipelineState('blocked')).toBe('blocked');
  });

  it('builds deterministic idempotency keys with override support', () => {
    expect(buildPipelineIdempotencyKey({ provided: 'explicit-key', slug: 'demo-app' })).toBe('explicit-key');
    expect(
      buildPipelineIdempotencyKey({
        slug: 'demo-app',
        dateBucket: '2026-04-04',
      }),
    ).toBe('demo-app:2026-04-04');
  });
});
