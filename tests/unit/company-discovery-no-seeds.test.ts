import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function getAllSourceFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== '.git') {
        files.push(...getAllSourceFiles(fullPath));
      }
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('FR-CDS-1: Zero Hardcoded Company Seeds Invariant', () => {
  it('ensures no static company seed arrays or hardcoded company directories exist in src', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const sourceFiles = getAllSourceFiles(srcDir);

    const seedPatterns = [
      /const\s+(?:SEED_COMPANIES|DEFAULT_COMPANIES|COMPANY_SEEDS|COMPANIES_LIST)\s*=/i,
      /let\s+(?:SEED_COMPANIES|DEFAULT_COMPANIES|COMPANY_SEEDS|COMPANIES_LIST)\s*=/i,
      /export\s+const\s+(?:SEED_COMPANIES|DEFAULT_COMPANIES|COMPANY_SEEDS)\s*=/i,
      /const\s+TOP_\d+_COMPANIES\s*=/i,
    ];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of seedPatterns) {
        const match = pattern.exec(content);
        if (match) {
          throw new Error(
            `Violation of FR-CDS-1 in ${file}: Hardcoded company seeds array detected: "${match[0]}". Company discovery must be dynamic and driven by user input or public probes.`
          );
        }
      }
    }

    expect(sourceFiles.length).toBeGreaterThan(10);
  });
});
