export class ModelRateLimiter {
  private timestamps: Map<string, number[]> = new Map();
  private pauseUntil: Map<string, number> = new Map();
  private defaultRpm: number;

  constructor(defaultRpm = 15) {
    this.defaultRpm = defaultRpm;
  }

  /**
   * Acquire a rate limit slot for a given model.
   * If the rate limit is exceeded or the model is paused, waits asynchronously.
   */
  async acquire(model: string, rpm = this.defaultRpm): Promise<void> {
    const now = Date.now();

    // 1. Check if model is paused due to 429 / Retry-After
    const paused = this.pauseUntil.get(model);
    if (paused && paused > now) {
      const waitMs = paused - now;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }

    // 2. Sliding 60-second window check
    const windowMs = 60000;
    const currentTimestamps = (this.timestamps.get(model) || []).filter(
      (ts) => now - ts < windowMs
    );

    if (currentTimestamps.length >= rpm) {
      // Find time when the oldest request in the window expires
      const oldest = currentTimestamps[0] ?? now;
      const waitMs = Math.max(0, windowMs - (now - oldest)) + 50; // extra 50ms jitter buffer
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return this.acquire(model, rpm);
    }

    currentTimestamps.push(Date.now());
    this.timestamps.set(model, currentTimestamps);
  }

  /**
   * Pauses requests for a model until a specific timestamp (e.g. from Retry-After header).
   */
  pause(model: string, retryAfterSeconds: number): void {
    const until = Date.now() + Math.max(1, retryAfterSeconds) * 1000;
    this.pauseUntil.set(model, until);
  }

  /**
   * Resets internal tracking (useful for testing).
   */
  reset(): void {
    this.timestamps.clear();
    this.pauseUntil.clear();
  }
}

export const globalRateLimiter = new ModelRateLimiter(15);
