import { describe, expect, it } from 'vitest';
import { TokenMapper } from '../src/codegen/token-mapper.js';
import type { DesignTokens } from '../src/types.js';

const tokens: DesignTokens = {
  colors: {
    primary: '#1890ff',
    success: '#52c41a',
    warning: '#faad14',
    error: '#f5222d',
    textPrimary: '#262626',
    textSecondary: '#595959',
    background: '#f5f5f5',
  },
  typography: {
    h1: { fontSize: '24px', fontWeight: 600 },
    h2: { fontSize: '20px', fontWeight: 600 },
    body: { fontSize: '14px', fontWeight: 400 },
  },
  spacing: { unit: 8, scale: [8, 16, 24, 32] },
  borderRadius: { sm: '4px', md: '8px', lg: '12px' },
};

describe('TokenMapper', () => {
  it('keeps concrete values in token definitions', () => {
    const mapper = new TokenMapper(tokens);
    const result = mapper.mapCode(`<style>
:root { --color-primary: #1890ff; }
.button { background: #1890ff; }
</style>`);

    expect(result).toContain('--color-primary: #1890ff');
    expect(result).toContain('background: var(--color-primary)');
    expect(result).not.toContain('--color-primary: var(--color-primary)');
  });
});
