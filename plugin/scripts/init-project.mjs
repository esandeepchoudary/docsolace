// First-run project bootstrap, called from skills/document/SKILL.md's Step 0
// after it asks the user for their app's base URL. Writes a real, valid
// autodocs.config.yaml (not a pointer at a file that doesn't exist in an
// installed plugin — see plugin/scripts/lib/bootstrap.mjs), makes sure
// secrets/session state can't be accidentally committed, and drops a short
// tours/README.md so "what do I do next" survives past the chat session.
import fs from 'node:fs';
import path from 'node:path';
import { renderAnnotatedConfig, ensureGitignoreEntries } from './lib/bootstrap.mjs';
import { writeFileAtomic } from './lib/fs-atomic.mjs';

// Matches the outputDir this same bootstrap writes into the config below —
// if a user later changes outputDir by hand, they're responsible for
// updating .gitignore to match (documented in the config's own comments).
// .playwright-mcp/ is the Playwright MCP server's own scratch directory
// (page snapshots, console logs) that the tour-scout subagent's browser
// driving drops into the project root the first time `/document propose`
// runs — confirmed by actually running it; without this it's un-ignored and
// can get committed by accident, the exact thing this bootstrap step exists
// to prevent.
const GITIGNORE_ENTRIES = ['.autodocs/artifacts/', '.env', '.playwright-mcp/'];

const TOURS_README = `# tours/

Each file here is one hand-authored (or human-confirmed) feature walk — see
the project README's "Configuring tours and auth" section for the YAML shape
and a worked example.

Quick path to your first tour, from inside Claude Code:

1. Implement or point at a feature you want documented.
2. \`/autodocs:document propose <slug> "<description>"\` — drafts a candidate
   tour by actually driving the app (\`status: proposed\`, \`maturity: draft\`).
3. Review the draft, fill in anything left as a TODO, then flip
   \`status: confirmed\` yourself — nothing here does that for you.
4. \`/autodocs:document <slug>\` — captures screenshots and generates its page.
5. \`/autodocs:document init-site\` once you've got at least one generated
   page, to scaffold a browsable docs site.

**Security reminder:** never commit \`.env\` or anything under
\`.autodocs/artifacts/.auth/\` — both can hold live credentials or session
cookies. This project's \`.gitignore\` already excludes them.
`;

const ENV_EXAMPLE = `# Copy to .env and fill in. .env is gitignored — never commit real credentials.
# Add one USERNAME/PASSWORD pair per scripted-login auth profile you define
# in autodocs.config.yaml (see its "auth" comments), matching the profile's
# usernameEnv/passwordEnv fields. Example:
#
# AUTODOCS_STANDARD_USER_USERNAME=demo
# AUTODOCS_STANDARD_USER_PASSWORD=demo-pass
`;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base-url') args.baseUrl = argv[i + 1];
  }
  if (!args.baseUrl) {
    console.error('Usage: init-project.mjs --base-url <http://localhost:PORT>');
    process.exit(1);
  }
  return args;
}

function main() {
  const { baseUrl } = parseArgs(process.argv.slice(2));
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const configPath = path.join(projectDir, 'autodocs.config.yaml');

  if (fs.existsSync(configPath)) {
    console.error(
      `"${configPath}" already exists — this project is already bootstrapped. Remove it first if you ` +
        `really want to start over.`,
    );
    process.exit(1);
  }

  // Fail before touching the filesystem if baseUrl is bad.
  const configYaml = renderAnnotatedConfig(baseUrl);
  writeFileAtomic(configPath, configYaml);

  const gitignorePath = path.join(projectDir, '.gitignore');
  const existingGitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
  const newGitignore = ensureGitignoreEntries(existingGitignore, GITIGNORE_ENTRIES);
  const gitignoreChanged = newGitignore !== existingGitignore;
  if (gitignoreChanged) {
    writeFileAtomic(gitignorePath, newGitignore);
  }

  fs.mkdirSync(path.join(projectDir, 'tours'), { recursive: true });
  const toursReadmePath = path.join(projectDir, 'tours', 'README.md');
  if (!fs.existsSync(toursReadmePath)) {
    writeFileAtomic(toursReadmePath, TOURS_README);
  }

  const envExamplePath = path.join(projectDir, '.env.example');
  const envExampleWritten = !fs.existsSync(envExamplePath);
  if (envExampleWritten) {
    writeFileAtomic(envExamplePath, ENV_EXAMPLE);
  }

  console.log(`Bootstrapped AutoDocs in ${projectDir}:`);
  console.log(`  - autodocs.config.yaml (baseUrl: ${baseUrl})`);
  console.log(
    gitignoreChanged
      ? '  - .gitignore now excludes .autodocs/artifacts/, .env, and .playwright-mcp/'
      : '  - .gitignore already excluded .autodocs/artifacts/, .env, and .playwright-mcp/',
  );
  console.log('  - tours/ (empty — see tours/README.md for next steps)');
  console.log(envExampleWritten ? '  - .env.example' : '  - .env.example already existed, left untouched');
}

try {
  main();
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
