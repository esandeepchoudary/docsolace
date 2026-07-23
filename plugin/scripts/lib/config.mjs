import fs from 'node:fs';
import { load as parseYaml } from 'js-yaml';

const SCRIPTED_AUTH_FIELDS = [
  'loginUrl',
  'usernameSelector',
  'passwordSelector',
  'submitSelector',
  'usernameEnv',
  'passwordEnv',
  'successUrlPattern',
];

// Two auth-profile shapes are valid: a saved-session profile (just
// storageStatePath) or a fully-specified scripted-login profile. Anything
// else is a config typo that would otherwise only surface deep inside
// capture.mjs's ensureAuthState, mid-tour — catch it upfront instead.
function assertValidAuthProfile(configPath, profileId, profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error(`autodocs config at "${configPath}": auth profile "${profileId}" must be an object`);
  }
  if (profile.storageStatePath !== undefined) {
    if (typeof profile.storageStatePath !== 'string' || !profile.storageStatePath) {
      throw new Error(
        `autodocs config at "${configPath}": auth profile "${profileId}"'s "storageStatePath" must be a non-empty string`,
      );
    }
    return;
  }
  const missing = SCRIPTED_AUTH_FIELDS.filter((field) => typeof profile[field] !== 'string' || !profile[field]);
  if (missing.length > 0) {
    throw new Error(
      `autodocs config at "${configPath}": auth profile "${profileId}" must have either "storageStatePath" ` +
        `(reuse a saved session) or all of ${SCRIPTED_AUTH_FIELDS.join(', ')} (scripted login) — missing: ${missing.join(', ')}`,
    );
  }
}

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
  for (const [name, size] of Object.entries(config.viewports)) {
    if (!size || typeof size.width !== 'number' || typeof size.height !== 'number') {
      throw new Error(
        `autodocs config at "${configPath}": viewport "${name}" needs a numeric "width" and "height"`,
      );
    }
  }
  if (
    config.pixelDiffThreshold !== undefined &&
    (typeof config.pixelDiffThreshold !== 'number' ||
      config.pixelDiffThreshold < 0 ||
      config.pixelDiffThreshold > 1)
  ) {
    throw new Error(
      `autodocs config at "${configPath}": "pixelDiffThreshold" must be a number between 0 and 1`,
    );
  }
  if (config.defaultMask !== undefined && !Array.isArray(config.defaultMask)) {
    throw new Error(`autodocs config at "${configPath}": "defaultMask" must be a list of selectors`);
  }
  if (config.launchArgs !== undefined && !Array.isArray(config.launchArgs)) {
    throw new Error(`autodocs config at "${configPath}": "launchArgs" must be a list of strings`);
  }
  if (config.auth !== undefined) {
    for (const [profileId, profile] of Object.entries(config.auth)) {
      assertValidAuthProfile(configPath, profileId, profile);
    }
  }
  if (config.seeds !== undefined) {
    if (typeof config.seeds !== 'object' || config.seeds === null || Array.isArray(config.seeds)) {
      throw new Error(`autodocs config at "${configPath}": "seeds" must be a map of seed id to definition`);
    }
    for (const [seedId, seed] of Object.entries(config.seeds)) {
      if (!seed || typeof seed !== 'object' || Array.isArray(seed)) {
        throw new Error(`autodocs config at "${configPath}": seed "${seedId}" must be an object`);
      }
      if (seed.command !== undefined && (typeof seed.command !== 'string' || !seed.command.trim())) {
        throw new Error(`autodocs config at "${configPath}": seed "${seedId}"'s "command" must be a non-empty string`);
      }
    }
  }
  if (config.allowSeedCommands !== undefined && typeof config.allowSeedCommands !== 'boolean') {
    throw new Error(`autodocs config at "${configPath}": "allowSeedCommands" must be a boolean`);
  }
  return config;
}
