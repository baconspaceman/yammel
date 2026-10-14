import { indexProfiles } from './registry';
import type { DifficultyProfile } from './types';

/** The profiles in data/difficulty/*.json, bundled with the app. */
const files = import.meta.glob('../../data/difficulty/*.json', { eager: true, import: 'default' });

export const shippedProfiles: ReadonlyMap<string, DifficultyProfile> = indexProfiles(Object.values(files));
