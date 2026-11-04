import { describe, expect, it, vi } from 'vitest';
import { silenceFlowAttributionWarning } from '../src/lib/flow-licence';

describe('graph library attribution warning', () => {
  it('drops the hidden-attribution notice and passes other warnings through', () => {
    const warn = vi.fn();
    const target = { warn };
    const undo = silenceFlowAttributionWarning(target);
    target.warn('React Flow: It seems like you are hiding the attribution. Please only do this when you are subscribed to React Flow Pro: https://reactflow.dev/remove-attr\n%cYou can ignore this warning if you are subscribed.', 'font-style: italic;');
    expect(warn).not.toHaveBeenCalled();
    target.warn('something else', 1);
    target.warn(new Error('not a string'));
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith('something else', 1);
    undo();
    expect(target.warn).toBe(warn);
  });
});
