import { describe, expect, it } from 'vitest';
import { fieldErrors, pathErrors } from './forms.ts';

// What a contract schema's failed check gives: each problem with its path.
const problems = {
  issues: [
    { path: ['name'], message: 'Give it a name' },
    { path: ['colors', 'accent'], message: 'Use a color' },
    { path: ['colors', 'accent'], message: 'A later problem' },
    { path: ['extras', 0, 'name'], message: 'Use lowercase letters' },
  ],
};

describe('fieldErrors', () => {
  it('keeps the first problem with each top-level field', () => {
    expect(fieldErrors(problems)).toEqual({
      name: 'Give it a name',
      colors: 'Use a color',
      extras: 'Use lowercase letters',
    });
  });
});

describe('pathErrors', () => {
  it('keeps the first problem at each full path, for nested fields', () => {
    expect(pathErrors(problems)).toEqual({
      name: 'Give it a name',
      'colors.accent': 'Use a color',
      'extras.0.name': 'Use lowercase letters',
    });
  });
});
