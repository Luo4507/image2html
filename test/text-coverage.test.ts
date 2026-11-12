import { describe, expect, it } from 'vitest';
import { calculateTextCoverage } from '../src/validator/text-coverage.js';

describe('calculateTextCoverage', () => {
  it('reports missing original text in generated code', () => {
    const result = calculateTextCoverage(
      ['欢迎登录', '企业级应用管理平台', '登 录'],
      '<h1>欢迎登录</h1><p>企业级应用管理平台</p>'
    );

    expect(result.originalCount).toBe(3);
    expect(result.matchedCount).toBe(2);
    expect(result.coverage).toBe(66.67);
    expect(result.missing).toEqual(['登 录']);
  });
});
