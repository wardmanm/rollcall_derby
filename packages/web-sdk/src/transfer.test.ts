import { describe, expect, it } from 'vitest';
import { exportUrl, importSummary } from './transfer.ts';

describe('exportUrl', () => {
  it('asks for chosen items as kind:id, or for whole kinds', () => {
    expect(
      exportUrl({
        items: [
          { kind: 'core:team', id: 't1' },
          { kind: 'producer:theme', id: 'th2' },
        ],
      }),
    ).toBe('/api/core/transfer/export?items=core%3Ateam%3At1%2Cproducer%3Atheme%3Ath2');
    expect(exportUrl({ kinds: ['core:team', 'producer:theme'] })).toBe(
      '/api/core/transfer/export?kinds=core%3Ateam%2Cproducer%3Atheme',
    );
  });
});

describe('importSummary', () => {
  it('says what an import did, in a sentence', () => {
    expect(importSummary({ added: 3, replaced: 1, keptBoth: 1, skipped: 1, copies: ['All Stars copy'] })).toBe(
      'Imported 5: 3 new, 1 replaced, 1 kept as a copy (“All Stars copy”). Skipped 1.',
    );
    expect(importSummary({ added: 0, replaced: 0, keptBoth: 2, skipped: 0, copies: ['A copy', 'B copy'] })).toBe(
      'Imported 2: 2 kept as copies (“A copy”, “B copy”).',
    );
    expect(importSummary({ added: 0, replaced: 0, keptBoth: 0, skipped: 2, copies: [] })).toBe(
      'Imported nothing. Skipped 2.',
    );
  });
});
