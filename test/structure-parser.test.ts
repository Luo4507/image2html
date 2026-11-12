import { describe, expect, it } from 'vitest';
import { parsePageStructure } from '../src/structure-parser.js';

describe('parsePageStructure', () => {
  it('parses JSON wrapped in a markdown code block', async () => {
    const result = await parsePageStructure(
      '```json\n{"page":{"title":"Demo"},"components":[]}\n```'
    );
    expect(result.page.title).toBe('Demo');
  });

  it('uses the repair callback for malformed model JSON', async () => {
    const result = await parsePageStructure(
      '{"page":{"title":"Demo"},"components":[',
      async () => '{"page":{"title":"Repaired"},"components":[]}'
    );
    expect(result.page.title).toBe('Repaired');
  });
});
