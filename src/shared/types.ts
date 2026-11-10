export type VerificationStatus =
  | 'verified'
  | 'partially_verified'
  | 'ai_estimate'
  | 'unverified'
  | 'contradictory'
  | 'unknown';

export type Unknown = {
  readonly kind: 'unknown';
  readonly reason?: string;
};

export type Known<T> = {
  readonly kind: 'known';
  readonly value: T;
};

export type MaybeKnown<T> = Known<T> | Unknown;

export function known<T>(value: T): Known<T> {
  return { kind: 'known', value };
}

export function unknown(reason?: string): Unknown {
  return { kind: 'unknown', reason };
}

export function isKnown<T>(item: MaybeKnown<T>): item is Known<T> {
  return item.kind === 'known';
}
