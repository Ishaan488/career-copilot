import crypto from 'node:crypto';
import { isCoreCategory } from '@/modules/human-review';

export interface VerifiedProfileSnapshot {
  fullName: string | null;
  headline: string | null;
  summary: string | null;
  currentCity: string | null;
  currentCountry: string | null;
  address: string | null;
  noticePeriodDays: number | null;
  currentEmploymentStatus: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  workAuthorizations: Array<{ country: string; status: string; details?: string | null }>;
  skills: Array<{ name: string; normalizedName: string }>;
}

export interface ReusableAnswerEntry {
  questionHash: string;
  normalizedQuestion: string;
  answer: unknown;
  category: string;
}

export interface MappedFieldAnswer {
  fieldId: string;
  fieldKey: string;
  label: string;
  type: string;
  required: boolean;
  category: string;
  options: Array<{ label: string; value: string }>;
  answer: unknown;
  decision: 'answered' | 'declined' | 'left_blank';
  source: 'profile' | 'reusable' | 'ai' | 'human';
  sourceRef?: string;
  confidence?: number;
  status: 'proposed' | 'needs_review' | 'approved' | 'filled' | 'verified_filled' | 'failed';
  needsReviewReason?: string;
}

/**
 * Maps extracted form fields against verified candidate profile data and reusable answers.
 */
export function mapFieldsToAnswers(
  fields: Array<{
    id: string;
    fieldKey: string;
    label: string;
    type: string;
    required: boolean;
    category: string;
    options: unknown;
  }>,
  profile: VerifiedProfileSnapshot,
  reusableAnswers: ReusableAnswerEntry[] = []
): MappedFieldAnswer[] {
  const reusableMap = new Map<string, ReusableAnswerEntry>();
  for (const ra of reusableAnswers) {
    reusableMap.set(ra.normalizedQuestion.toLowerCase().trim(), ra);
    reusableMap.set(ra.questionHash, ra);
  }

  const results: MappedFieldAnswer[] = [];

  for (const f of fields) {
    const rawOptions = (Array.isArray(f.options) ? f.options : []) as Array<{ label: string; value: string }>;
    const normalizedLabel = f.label.toLowerCase().trim();
    const isCore = isCoreCategory(f.category);

    let answer: unknown = null;
    let decision: 'answered' | 'declined' | 'left_blank' = 'answered';
    let source: 'profile' | 'reusable' | 'ai' | 'human' = 'profile';
    let sourceRef: string | undefined;
    let confidence = 1.0;
    let status: 'proposed' | 'needs_review' | 'approved' = 'proposed';
    let needsReviewReason: string | undefined;

    // 1. Profile fields matching
    if (normalizedLabel.includes('first name') || normalizedLabel === 'first') {
      const parts = (profile.fullName || '').split(' ');
      answer = parts[0] || null;
      sourceRef = 'profile.fullName[0]';
    } else if (normalizedLabel.includes('last name') || normalizedLabel === 'last') {
      const parts = (profile.fullName || '').split(' ');
      answer = parts.length > 1 ? parts.slice(1).join(' ') : null;
      sourceRef = 'profile.fullName[1..]';
    } else if (
      normalizedLabel.includes('full name') ||
      normalizedLabel === 'name' ||
      normalizedLabel === 'candidate name'
    ) {
      answer = profile.fullName;
      sourceRef = 'profile.fullName';
    } else if (f.type === 'email' || normalizedLabel.includes('email')) {
      answer = profile.primaryEmail;
      sourceRef = 'profile.primaryEmail';
    } else if (f.type === 'phone' || normalizedLabel.includes('phone') || normalizedLabel.includes('mobile')) {
      answer = profile.primaryPhone;
      sourceRef = 'profile.primaryPhone';
    } else if (normalizedLabel.includes('city')) {
      answer = profile.currentCity;
      sourceRef = 'profile.currentCity';
    } else if (normalizedLabel.includes('country')) {
      answer = profile.currentCountry;
      sourceRef = 'profile.currentCountry';
    } else if (normalizedLabel.includes('address') || normalizedLabel.includes('street')) {
      answer = profile.address;
      sourceRef = 'profile.address';
    } else if (normalizedLabel.includes('notice period') || normalizedLabel.includes('how soon')) {
      answer = profile.noticePeriodDays !== null ? `${profile.noticePeriodDays} days` : null;
      sourceRef = 'profile.noticePeriodDays';
    } else if (f.category === 'work_auth' && profile.workAuthorizations.length > 0) {
      // Work auth from profile
      const auth = profile.workAuthorizations[0];
      if (auth) {
        const isAuthorized = auth.status.toLowerCase().includes('authorized') || auth.status.toLowerCase() === 'citizen';
        answer = isAuthorized ? 'yes' : 'no';
        sourceRef = 'profile.workAuthorizations';
        source = 'profile';
      }
    }

    // 2. Reusable answers matching
    if (!answer) {
      const matchedReusable = reusableMap.get(normalizedLabel);
      if (matchedReusable) {
        answer = matchedReusable.answer;
        source = 'reusable';
        sourceRef = `reusable:${matchedReusable.questionHash}`;
      }
    }

    // 3. Option normalization for select/radio
    if (answer && (f.type === 'select' || f.type === 'radio') && rawOptions.length > 0) {
      const strAnswer = String(answer).toLowerCase();
      const matchedOpt = rawOptions.find(
        (o) => o.value.toLowerCase() === strAnswer || o.label.toLowerCase() === strAnswer
      );
      if (matchedOpt) {
        answer = matchedOpt.value;
      }
    }

    // 4. File uploads (e.g. resume)
    if (f.type === 'file') {
      answer = '[RESUME_FILE_ATTACHED]';
      source = 'profile';
      sourceRef = 'resume';
      status = 'approved';
    }

    // 5. Review requirement invariants (Doc 03 §HIT, Doc 10 §4, Doc 12 §5)
    // Core categories (legal, consent, bond, work_auth, salary, eeo, sensitive) MUST be human-reviewed
    if (isCore) {
      status = 'needs_review';
      needsReviewReason = `Core protected category '${f.category}' requires explicit human verification`;
    } else if (f.required && (answer === null || answer === undefined || answer === '')) {
      status = 'needs_review';
      decision = 'left_blank';
      needsReviewReason = `Required field '${f.label}' has no verified profile or reusable answer`;
    } else if (!f.required && (answer === null || answer === undefined || answer === '')) {
      decision = 'left_blank';
      status = 'approved'; // Non-required blank fields can proceed safely
    } else if (source === 'profile' && answer) {
      status = 'approved';
    } else {
      status = 'proposed';
    }

    results.push({
      fieldId: f.id,
      fieldKey: f.fieldKey,
      label: f.label,
      type: f.type,
      required: f.required,
      category: f.category,
      options: rawOptions,
      answer,
      decision,
      source,
      sourceRef,
      confidence,
      status,
      needsReviewReason,
    });
  }

  return results;
}

/**
 * Computes deterministic summary hash covering answers + resume SHA-256 + target URL (Doc 10 §4 Step 11, Doc 12 §5).
 */
export function computeSummaryHash(
  applicationUrl: string,
  resumeSha256: string,
  answers: Array<{ fieldKey: string; answer: unknown; decision: string }>
): string {
  const sortedAnswers = [...answers].sort((a, b) => a.fieldKey.localeCompare(b.fieldKey));
  const raw = `${applicationUrl.trim()}|${resumeSha256.trim()}|${JSON.stringify(sortedAnswers)}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}
