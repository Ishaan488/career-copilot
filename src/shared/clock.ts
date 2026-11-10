let clockOverride: (() => Date) | null = null;

export const clock = {
  now(): Date {
    return clockOverride ? clockOverride() : new Date();
  },
  nowISO(): string {
    return this.now().toISOString();
  },
  setOverride(fn: (() => Date) | null): void {
    clockOverride = fn;
  },
  reset(): void {
    clockOverride = null;
  },
};
