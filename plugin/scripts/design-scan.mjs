// Prints ranked design/brand-skill candidates found in this project and the
// current user's home directory, as JSON — the /document skill (a prompt,
// not a script) reads this to decide which skill (if any) to invoke via the
// Skill tool. This script never invokes a skill itself; only the harness's
// Skill tool can do that.
import { discoverDesignSkills } from './lib/design.mjs';

function main() {
  const candidates = discoverDesignSkills({
    projectDir: process.cwd(),
    homeDir: process.env.HOME ?? process.env.USERPROFILE,
  });
  console.log(JSON.stringify({ candidates }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
