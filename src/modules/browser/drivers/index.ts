import { PortalDriver } from '../types';
import { GreenhouseDriver } from './greenhouse';
import { LeverDriver } from './lever';
import { AshbyDriver } from './ashby';
import { GenericDriver } from './generic';

export { BasePortalDriver } from './base';
export { GreenhouseDriver } from './greenhouse';
export { LeverDriver } from './lever';
export { AshbyDriver } from './ashby';
export { GenericDriver } from './generic';

export const portalDrivers: PortalDriver[] = [
  new GreenhouseDriver(),
  new LeverDriver(),
  new AshbyDriver(),
  new GenericDriver(), // Fallback must always be last
];

/**
 * Resolves the appropriate PortalDriver instance for a target application URL.
 */
export function getDriverForUrl(urlStr: string | URL): PortalDriver {
  try {
    const url = typeof urlStr === 'string' ? new URL(urlStr) : urlStr;
    for (const driver of portalDrivers) {
      if (driver.matches(url)) {
        return driver;
      }
    }
  } catch {
    // If URL is invalid, fallback to generic
  }

  return new GenericDriver();
}
