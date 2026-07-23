import fs from 'node:fs';
import { load as parseYaml } from 'js-yaml';

export function loadConfig(configPath) {
  const config = parseYaml(fs.readFileSync(configPath, 'utf8'));
  if (!config.baseUrl) {
    throw new Error(`autodocs config at "${configPath}" is missing required "baseUrl"`);
  }
  if (!config.outputDir) {
    throw new Error(`autodocs config at "${configPath}" is missing required "outputDir"`);
  }
  if (!config.viewports || Object.keys(config.viewports).length === 0) {
    throw new Error(`autodocs config at "${configPath}" needs at least one entry under "viewports"`);
  }
  return config;
}
