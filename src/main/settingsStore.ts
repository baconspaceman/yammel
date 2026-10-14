import { join } from 'node:path';
import { parseSettings, type Settings } from '../shared/settings';
import { JsonFileStore } from './jsonStore';

const MAX_SETTINGS_BYTES = 64 * 1024;

/**
 * Saved settings in one small JSON file inside the app's own data folder. A missing, unreadable or damaged
 * file means "defaults": the app always starts. Nothing is written until the person changes a setting.
 */
export class SettingsStore extends JsonFileStore<Settings> {
  constructor(file: string) {
    super(file, parseSettings, MAX_SETTINGS_BYTES);
  }

  static in(folder: string): SettingsStore {
    return new SettingsStore(join(folder, 'settings.json'));
  }
}
