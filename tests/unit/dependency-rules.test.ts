import { describe, it, expect } from 'vitest';
import { cruise } from 'dependency-cruiser';
import path from 'node:path';

describe('Dependency boundary rules', () => {
  it('passes cleanly across all src files', async () => {
    const config = require(path.resolve(process.cwd(), '.dependency-cruiser.cjs'));
    const result = await cruise(['src'], config);

    expect(typeof result.output).not.toBe('string');
    if (typeof result.output !== 'string') {
      expect(result.output.summary.error).toBe(0);
      expect(result.output.summary.violations).toHaveLength(0);
    }
  }, 180000);
});
