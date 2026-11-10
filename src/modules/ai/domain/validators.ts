import { JdAnalysisOutput } from '../prompts/jd-analysis';
import { normalizeSkillName } from './skills-alias';
import { detectSuspiciousPatterns } from './sanitizer';

/**
 * Normalizes whitespace (collapses multiple whitespace chars and linebreaks to single spaces, trims).
 */
export function normalizeWhitespace(str: string): string {
  if (!str) return '';
  return str.replace(/\s+/g, ' ').trim().toLowerCase();
}

export interface ValidatedJdAnalysis {
  output: JdAnalysisOutput;
  normalizedSkills: Array<{
    name: string;
    normalizedName: string;
    level: 'required' | 'preferred';
    mandatory: boolean;
    quote: string | null;
    minYears: number | null;
  }>;
  injectionSuspected: boolean;
  warnings: string[];
}

/**
 * Semantic validator for JD Analysis output:
 * 1. Verifies that every skill's `quote` is an actual substring of the original JD text (case-insensitive, whitespace-normalized).
 *    If the quote is not found in the JD, it drops the mandatory flag (mandatory=false) and flags a warning.
 * 2. Normalizes skill names using canonical skills alias mapping.
 * 3. Enforces experience years bounds [0, 50].
 * 4. Combines model-reported injection_suspected with heuristic pattern detector.
 */
export function validateJdAnalysis(
  rawOutput: JdAnalysisOutput,
  originalJdText: string
): ValidatedJdAnalysis {
  const warnings: string[] = [];
  const normalizedJd = normalizeWhitespace(originalJdText);

  // 1. Check injection
  let injectionSuspected = rawOutput.injection_suspected || detectSuspiciousPatterns(originalJdText);
  if (injectionSuspected) {
    warnings.push('Untrusted content warning: suspicious instruction or injection pattern detected in job description');
  }

  // 2. Validate experience years bounds (0 - 50)
  let expMin = rawOutput.experienceMinYears ?? null;
  let expMax = rawOutput.experienceMaxYears ?? null;
  if (expMin !== null && (expMin < 0 || expMin > 50)) {
    warnings.push(`Invalid experienceMinYears: ${expMin}, resetting to null`);
    expMin = null;
  }
  if (expMax !== null && (expMax < 0 || expMax > 50)) {
    warnings.push(`Invalid experienceMaxYears: ${expMax}, resetting to null`);
    expMax = null;
  }
  if (expMin !== null && expMax !== null && expMin > expMax) {
    warnings.push(`experienceMinYears (${expMin}) exceeds experienceMaxYears (${expMax}), swapping`);
    const temp = expMin;
    expMin = expMax;
    expMax = temp;
  }

  // 3. Validate skill quotes and normalize skill names
  const normalizedSkills: ValidatedJdAnalysis['normalizedSkills'] = [];
  const seenSkillNames = new Set<string>();

  for (const skill of rawOutput.skills) {
    const rawQuote = (skill.quote || '').trim();
    const normalizedQuote = normalizeWhitespace(rawQuote);
    const quoteFound = normalizedQuote.length > 0 && normalizedJd.includes(normalizedQuote);

    let mandatory = skill.mandatory;
    let quoteToSave: string | null = rawQuote;

    if (!quoteFound && rawQuote.length > 0) {
      warnings.push(`Skill "${skill.name}" quote was not found as verbatim substring in JD. Dropped mandatory requirement.`);
      mandatory = false;
      quoteToSave = null;
    }

    const canonicalName = normalizeSkillName(skill.name);
    if (!canonicalName) continue;

    // Deduplicate skills by canonical name, prioritizing mandatory/required
    if (seenSkillNames.has(canonicalName)) {
      const existing = normalizedSkills.find((s) => s.normalizedName === canonicalName);
      if (existing) {
        if (mandatory && !existing.mandatory) {
          existing.mandatory = true;
          existing.level = 'required';
          if (quoteToSave) existing.quote = quoteToSave;
        }
      }
      continue;
    }

    seenSkillNames.add(canonicalName);

    normalizedSkills.push({
      name: skill.name.trim(),
      normalizedName: canonicalName,
      level: skill.level === 'preferred' && !mandatory ? 'preferred' : 'required',
      mandatory,
      quote: quoteToSave,
      minYears: skill.minYears ?? null,
    });
  }

  return {
    output: {
      ...rawOutput,
      experienceMinYears: expMin,
      experienceMaxYears: expMax,
      injection_suspected: injectionSuspected,
    },
    normalizedSkills,
    injectionSuspected,
    warnings,
  };
}
