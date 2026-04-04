import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSend,
  mockSubscribe,
  mockOn,
  mockChannel,
  mockRemoveChannel,
} = vi.hoisted(() => {
  const send = vi.fn().mockResolvedValue(undefined);
  const subscribe = vi.fn(() => ({ send }));
  const on = vi.fn(() => ({ subscribe }));
  const channel = vi.fn(() => ({ on }));
  const removeChannel = vi.fn();
  return {
    mockSend: send,
    mockSubscribe: subscribe,
    mockOn: on,
    mockChannel: channel,
    mockRemoveChannel: removeChannel,
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

import { emitQuickActionEvent, subscribeQuickActionEvents } from './quickActionEvents';

describe('quickActionEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes bridge once and emits event locally and through realtime channel', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeQuickActionEvents(handler);

    emitQuickActionEvent('product_added');

    expect(mockChannel).toHaveBeenCalledWith('quick-actions-live');
    expect(mockOn).toHaveBeenCalledWith('broadcast', { event: 'quick_action' }, expect.any(Function));
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('product_added');
    expect(mockSend).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'quick_action',
      payload: { type: 'product_added' },
    });

    unsubscribe();
  });

  it('supports multiple subscribers and cleans up channel when last unsubscribes', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubFirst = subscribeQuickActionEvents(first);
    const unsubSecond = subscribeQuickActionEvents(second);

    emitQuickActionEvent('credits_added');
    expect(first).toHaveBeenCalledWith('credits_added');
    expect(second).toHaveBeenCalledWith('credits_added');

    unsubFirst();
    expect(mockRemoveChannel).not.toHaveBeenCalled();

    unsubSecond();
    expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
  });

  it('allows bridge re-initialization after cleanup', () => {
    const handler = vi.fn();
    const unsub = subscribeQuickActionEvents(handler);
    emitQuickActionEvent('apk_uploaded');
    unsub();

    const handlerTwo = vi.fn();
    const unsubTwo = subscribeQuickActionEvents(handlerTwo);
    emitQuickActionEvent('server_deployed');

    expect(mockChannel).toHaveBeenCalledTimes(2);
    expect(handlerTwo).toHaveBeenCalledWith('server_deployed');
    unsubTwo();
  });
});
