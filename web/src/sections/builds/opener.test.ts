import { describe, expect, it } from 'vitest';
import { createExitGate } from './opener';

describe('createExitGate', () => {
  it('ignores the exit the drawer reports at mount, before anything was opened', () => {
    const gate = createExitGate();
    expect(gate.take()).toBe(false);
    expect(gate.take()).toBe(false);
  });

  it('lets exactly one exit through per open', () => {
    const gate = createExitGate();
    gate.opened();
    expect(gate.take()).toBe(true);
    expect(gate.take()).toBe(false);
  });

  it('counts a chain of opens (one drawer, several apps) as one exit', () => {
    const gate = createExitGate();
    gate.opened();
    gate.opened();
    gate.opened();
    expect(gate.take()).toBe(true);
    expect(gate.take()).toBe(false);
  });

  it('works again for the next open', () => {
    const gate = createExitGate();
    gate.opened();
    expect(gate.take()).toBe(true);
    gate.opened();
    expect(gate.take()).toBe(true);
  });
});
