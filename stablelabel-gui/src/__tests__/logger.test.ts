import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '../logger';

describe('logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('info() calls console.log with tag prefix', () => {
    logger.info('TEST_TAG', 'hello world');
    expect(console.log).toHaveBeenCalledTimes(1);
    const args = (console.log as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[0]).toMatch(/\[.*\] \[TEST_TAG\]/);
    expect(args[1]).toBe('hello world');
  });

  it('warn() calls console.warn with tag prefix', () => {
    logger.warn('WARN_TAG', 'be careful');
    expect(console.warn).toHaveBeenCalledTimes(1);
    const args = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[0]).toMatch(/\[.*\] \[WARN_TAG\]/);
    expect(args[1]).toBe('be careful');
  });

  it('error() calls console.error with tag prefix', () => {
    logger.error('ERR_TAG', 'something broke');
    expect(console.error).toHaveBeenCalledTimes(1);
    const args = (console.error as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[0]).toMatch(/\[.*\] \[ERR_TAG\]/);
    expect(args[1]).toBe('something broke');
  });

  it('includes ISO timestamp in prefix', () => {
    logger.info('TS', 'msg');
    const prefix = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // ISO 8601 timestamp pattern
    expect(prefix).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('passes extra arguments through', () => {
    const err = new Error('test');
    logger.error('TAG', 'message', err, { detail: 42 });
    const args = (console.error as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[2]).toBe(err);
    expect(args[3]).toEqual({ detail: 42 });
  });

  it('info() does not call console.error or console.warn', () => {
    logger.info('TAG', 'msg');
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('error() does not call console.log or console.warn', () => {
    logger.error('TAG', 'msg');
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });
});
