import { SourceType, SourceAdapter } from './types';
import { GreenhouseAdapter } from './greenhouse';
import { LeverAdapter } from './lever';
import { AshbyAdapter } from './ashby';
import { SmartRecruitersAdapter } from './smartrecruiters';
import { RssFeedAdapter } from './rss';
import { UrlImportAdapter } from './url-import';
import { ManualPasteAdapter } from './manual-paste';
import { AppError } from '@/shared/errors';

const greenhouse = new GreenhouseAdapter();
const lever = new LeverAdapter();
const ashby = new AshbyAdapter();
const smartrecruiters = new SmartRecruitersAdapter();
const rss = new RssFeedAdapter();
const urlImport = new UrlImportAdapter();
const manualPaste = new ManualPasteAdapter();

const adapterRegistry: Record<SourceType, SourceAdapter<unknown>> = {
  greenhouse,
  lever,
  ashby,
  smartrecruiters,
  rss_feed: rss,
  url_import: urlImport,
  manual_paste: manualPaste,
};

export function getSourceAdapter(type: SourceType): SourceAdapter<unknown> {
  const adapter = adapterRegistry[type];
  if (!adapter) {
    throw new AppError('VALIDATION', `No source adapter implemented for type '${type}'`);
  }
  return adapter;
}

export function getAllAdapters(): Record<SourceType, SourceAdapter<unknown>> {
  return adapterRegistry;
}
