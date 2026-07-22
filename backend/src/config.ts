import fs from 'fs';
import path from 'path';

const CONFIG_PATH = path.join(__dirname, '../../data/config.json');

export interface AppConfig {
  /** Absolute path to STS2 saves root (or a profile saves folder). */
  savesPath?: string;
  /** User that auto-imported .run files are attributed to. */
  watcherUserId?: number;
}

export function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch {
    // ignore
  }
  return {};
}

export function saveConfig(config: AppConfig): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
