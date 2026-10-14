import { parseFactsFile, parseFeelFile } from './games';
import type { FeelFile, WorldFactsFile } from './types';

/** data/feel-profiles.json and data/world-features.json, bundled with the app. Either may be missing. */
const feelFiles = import.meta.glob('../../data/feel-profiles.json', { eager: true, import: 'default' });
const factFiles = import.meta.glob('../../data/world-features.json', { eager: true, import: 'default' });

export const shippedFeel: FeelFile = parseFeelFile(Object.values(feelFiles)[0]);
export const shippedFacts: WorldFactsFile = parseFactsFile(Object.values(factFiles)[0]);
