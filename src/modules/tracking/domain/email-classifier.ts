// Pure Email Classification for Application Status Suggestions (Doc 03 FR-TRK-2, User Q15)
import { ApplicationStatus } from './lifecycle';

export interface EmailClassificationResult {
  isMatch: boolean;
  suggestedStatus?: ApplicationStatus;
  category: 'confirmation' | 'assessment' | 'interview' | 'rejection' | 'offer' | 'inconclusive';
  confidence: number;
  reasoning: string;
  extractedSnippet?: string;
}

interface KeywordRule {
  category: EmailClassificationResult['category'];
  suggestedStatus: ApplicationStatus;
  baseConfidence: number;
  patterns: RegExp[];
}

const CLASSIFICATION_RULES: KeywordRule[] = [
  {
    category: 'offer',
    suggestedStatus: 'offer_received',
    baseConfidence: 0.95,
    patterns: [
      /\boffer of employment\b/i,
      /\bpleased to offer\b/i,
      /\bjob offer\b/i,
      /\bformal offer letter\b/i,
      /\bwelcome to the team\b/i,
      /\bemployment agreement\b/i,
    ],
  },
  {
    category: 'interview',
    suggestedStatus: 'interview_scheduled',
    baseConfidence: 0.9,
    patterns: [
      /\binvitation to interview\b/i,
      /\bschedule an interview\b/i,
      /\bwould like to interview you\b/i,
      /\bphone interview\b/i,
      /\bvideo interview\b/i,
      /\btechnical interview\b/i,
      /\bsystem design interview\b/i,
      /\bchat with the team\b/i,
      /\bcalendly\.com\b/i,
      /\bgoodtime\.io\b/i,
      /\binterview confirmation\b/i,
      /\bnext steps in the interview process\b/i,
    ],
  },
  {
    category: 'assessment',
    suggestedStatus: 'assessment_received',
    baseConfidence: 0.9,
    patterns: [
      /\btake[- ]home assessment\b/i,
      /\bcoding assessment\b/i,
      /\bhackerrank\b/i,
      /\bcodesignal\b/i,
      /\bonline assessment\b/i,
      /\bcomplete the assessment\b/i,
      /\btechnical challenge\b/i,
      /\bwork sample test\b/i,
    ],
  },
  {
    category: 'rejection',
    suggestedStatus: 'rejected',
    baseConfidence: 0.88,
    patterns: [
      /\bnot moving forward\b/i,
      /\bdecided to pursue other candidates\b/i,
      /\bother applicants whose qualifications\b/i,
      /\bwill not be moving forward\b/i,
      /\bwe will not be proceeding\b/i,
      /\bunfortunately, at this time\b/i,
      /\bdecided not to proceed\b/i,
      /\bimpressive background.*however\b/is,
    ],
  },
  {
    category: 'confirmation',
    suggestedStatus: 'under_review',
    baseConfidence: 0.95,
    patterns: [
      /\bthank you for applying\b/i,
      /\bapplication received\b/i,
      /\bwe have received your application\b/i,
      /\bconfirming receipt of your application\b/i,
      /\bsuccessfully submitted your application\b/i,
    ],
  },
];

/**
 * Pure rule-based classifier for inbound email communications (FR-TRK-2).
 * Strictly produces suggestions for human confirmation; never mutates DB directly.
 */
export function classifyEmailContent(
  subject: string,
  bodySnippet: string
): EmailClassificationResult {
  const combinedText = `${subject}\n${bodySnippet}`.trim();
  if (!combinedText) {
    return {
      isMatch: false,
      category: 'inconclusive',
      confidence: 0,
      reasoning: 'Empty subject and body content provided.',
    };
  }

  for (const rule of CLASSIFICATION_RULES) {
    for (const pattern of rule.patterns) {
      const match = pattern.exec(combinedText);
      if (match) {
        return {
          isMatch: true,
          suggestedStatus: rule.suggestedStatus,
          category: rule.category,
          confidence: rule.baseConfidence,
          reasoning: `Matched trigger pattern: "${match[0]}"`,
          extractedSnippet: match[0],
        };
      }
    }
  }

  return {
    isMatch: false,
    category: 'inconclusive',
    confidence: 0,
    reasoning: 'No recognized hiring lifecycle patterns detected in message content.',
  };
}
