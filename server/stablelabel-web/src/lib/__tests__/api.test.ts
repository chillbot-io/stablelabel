import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, ApiError, setTokenProvider } from '../api';

describe('api client', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Reset token provider before each test
    setTokenProvider(async () => null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('makes a GET request to the correct URL', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: 'test' }),
    });

    const result = await api.get('/items');

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/items', {
      method: 'GET',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: undefined,
      signal: undefined,
    });
    expect(result).toEqual({ data: 'test' });
  });

  it('sends a JSON body on POST', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: '1' }),
    });

    await api.post('/items', { name: 'new' });

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/items', {
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name: 'new' }),
      signal: undefined,
    });
  });

  it('returns undefined for 204 No Content', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    });

    const result = await api.delete('/items/1');
    expect(result).toBeUndefined();
  });

  it('throws ApiError on non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ detail: 'Item not found' }),
    });

    await expect(api.get('/items/999')).rejects.toThrow(ApiError);
    await expect(api.get('/items/999')).rejects.toThrow('Item not found');
  });

  it('falls back to statusText when response JSON has no detail', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    });

    try {
      await api.get('/fail');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(500);
      expect((e as ApiError).message).toBe('Internal Server Error');
    }
  });

  it('attaches Authorization header when token provider returns a token', async () => {
    setTokenProvider(async () => 'my-token');

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    await api.get('/secure');

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/secure', {
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer my-token',
      }),
      body: undefined,
      signal: undefined,
    });
  });
});
