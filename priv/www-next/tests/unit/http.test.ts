import { describe, it, expect } from 'vitest';
import { OcsApiError } from '@/services/http';

describe('OcsApiError', () => {
  it('captures status and problem details', () => {
    const err = new OcsApiError('boom', 422, {
      title: 'Validation failed',
      invalidParams: [{ param: 'name', reason: 'required' }],
    });
    expect(err.status).toBe(422);
    expect(err.problem?.invalidParams?.[0]?.param).toBe('name');
    expect(err.message).toBe('boom');
  });
});
