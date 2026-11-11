import { BasePortalDriver } from './base';

export class GenericDriver extends BasePortalDriver {
  readonly id = 'generic' as const;

  matches(_url: URL): boolean {
    // Generic driver matches any portal as fallback
    return true;
  }
}
