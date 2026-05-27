import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CircuitBreaker } from './circuit.js';

describe('CircuitBreaker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts closed', () => {
    const cb = new CircuitBreaker({ threshold: 3, cooldownMs: 1000 });
    expect(cb.isOpen('siputzx')).toBe(false);
  });

  it('opens after threshold consecutive failures', () => {
    const cb = new CircuitBreaker({ threshold: 3, cooldownMs: 1000 });
    cb.recordFailure('siputzx');
    cb.recordFailure('siputzx');
    expect(cb.isOpen('siputzx')).toBe(false);
    cb.recordFailure('siputzx');
    expect(cb.isOpen('siputzx')).toBe(true);
  });

  it('resets counter on success before threshold', () => {
    const cb = new CircuitBreaker({ threshold: 3, cooldownMs: 1000 });
    cb.recordFailure('siputzx');
    cb.recordFailure('siputzx');
    cb.recordSuccess('siputzx');
    cb.recordFailure('siputzx');
    cb.recordFailure('siputzx');
    expect(cb.isOpen('siputzx')).toBe(false);
  });

  it('open transitions to half-open after cooldown', () => {
    const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 1000 });
    cb.recordFailure('siputzx');
    expect(cb.isOpen('siputzx')).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(cb.isOpen('siputzx')).toBe(false);
  });

  it('half-open success closes circuit and resets counter', () => {
    const cb = new CircuitBreaker({ threshold: 2, cooldownMs: 1000 });
    cb.recordFailure('siputzx');
    cb.recordFailure('siputzx');
    expect(cb.isOpen('siputzx')).toBe(true);
    vi.advanceTimersByTime(1001);
    cb.isOpen('siputzx');
    cb.recordSuccess('siputzx');
    cb.recordFailure('siputzx');
    expect(cb.isOpen('siputzx')).toBe(false);
  });

  it('half-open failure re-opens with fresh cooldown', () => {
    const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 1000 });
    cb.recordFailure('siputzx');
    vi.advanceTimersByTime(1001);
    cb.isOpen('siputzx');
    cb.recordFailure('siputzx');
    expect(cb.isOpen('siputzx')).toBe(true);
    vi.advanceTimersByTime(500);
    expect(cb.isOpen('siputzx')).toBe(true);
  });

  it('isolates state per provider', () => {
    const cb = new CircuitBreaker({ threshold: 1, cooldownMs: 1000 });
    cb.recordFailure('siputzx');
    expect(cb.isOpen('siputzx')).toBe(true);
    expect(cb.isOpen('covenant')).toBe(false);
  });
});