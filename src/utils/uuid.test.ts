import { isUuid } from './uuid';

describe('isUuid', () => {
  test('returns true for valid uuid', () => {
    expect(isUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
  });

  test('returns false for temporary webui conversation id', () => {
    expect(isUuid('default-1770197702599')).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isUuid('')).toBe(false);
  });
});

