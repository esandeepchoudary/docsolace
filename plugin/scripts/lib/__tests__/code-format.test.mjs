import { describe, expect, it } from 'vitest';
import { autoFenceCommandLines, looksLikeCommandLine } from '../code-format.mjs';

describe('looksLikeCommandLine', () => {
  it('recognizes a Claude Code slash-command', () => {
    expect(looksLikeCommandLine('/plugin marketplace add esandeepchoudary/docsolace')).toBe(true);
    expect(looksLikeCommandLine('/reload-plugins')).toBe(true);
  });

  it('recognizes known verb + subcommand shell commands', () => {
    expect(looksLikeCommandLine('npm run test')).toBe(true);
    expect(looksLikeCommandLine('npx playwright install chromium')).toBe(true);
    expect(looksLikeCommandLine('git status')).toBe(true);
    expect(looksLikeCommandLine('cd demo-app')).toBe(true);
    expect(looksLikeCommandLine('cp .env.example .env')).toBe(true);
    expect(looksLikeCommandLine('mkdir -p docs/adr')).toBe(true);
  });

  it('does not flag an ordinary sentence that happens to start with a command verb', () => {
    expect(looksLikeCommandLine('git is also required.')).toBe(false);
    expect(looksLikeCommandLine('cd into the right directory before running this.')).toBe(false);
    expect(looksLikeCommandLine('node scripts are used throughout:')).toBe(false);
  });

  it('does not flag a verb whose subcommand is not in the known whitelist', () => {
    expect(looksLikeCommandLine('npm is the standard package manager')).toBe(false);
  });

  it('does not flag blank or whitespace-only lines', () => {
    expect(looksLikeCommandLine('')).toBe(false);
    expect(looksLikeCommandLine('   ')).toBe(false);
  });
});

describe('autoFenceCommandLines', () => {
  it('wraps a run of consecutive slash-commands with no language tag', () => {
    const body = [
      'Inside Claude Code, add this repo as a plugin marketplace and install the plugin from it:',
      '',
      '/plugin marketplace add esandeepchoudary/docsolace',
      '/plugin install docsolace@docsolace-marketplace',
      '/reload-plugins',
      '',
      'Verify with /plugin list.',
    ].join('\n');

    const result = autoFenceCommandLines(body);

    expect(result).toContain(
      '```\n/plugin marketplace add esandeepchoudary/docsolace\n/plugin install docsolace@docsolace-marketplace\n/reload-plugins\n```',
    );
    expect(result).toContain('Verify with /plugin list.');
  });

  it('wraps a run of consecutive shell commands with a bash language tag', () => {
    const body = ['Run these in order:', '', 'npm install', 'cp .env.example .env', 'npm run dev', ''].join('\n');

    const result = autoFenceCommandLines(body);

    expect(result).toContain('```bash\nnpm install\ncp .env.example .env\nnpm run dev\n```');
  });

  it('uses bash (not the no-language form) when a run mixes slash-commands and shell commands', () => {
    const body = ['/document validate', 'npm test', ''].join('\n');
    const result = autoFenceCommandLines(body);
    expect(result).toContain('```bash\n/document validate\nnpm test\n```');
  });

  it('wraps a single lone qualifying line', () => {
    const body = 'First, run the following.\n\nnpm run drift\n\nThen check the output.';
    const result = autoFenceCommandLines(body);
    expect(result).toContain('```bash\nnpm run drift\n```');
  });

  it('leaves plain prose entirely untouched, including a sentence starting with a command verb', () => {
    const body = 'git is also required. Node.js 22+ and npm are needed too, along with a working internet connection.';
    expect(autoFenceCommandLines(body)).toBe(body);
  });

  it('leaves an inline, mid-sentence command mention untouched (not a standalone line)', () => {
    const body = 'In one terminal: npm install, cp .env.example .env, then npm run dev.';
    expect(autoFenceCommandLines(body)).toBe(body);
  });

  it('does not re-wrap or otherwise touch content already inside a fenced block', () => {
    const body = ['Example config:', '', '```yaml', 'baseUrl: http://localhost:5173', '```', ''].join('\n');
    expect(autoFenceCommandLines(body)).toBe(body);
  });

  it('does not mistake command-like lines inside an existing fence for unfenced ones', () => {
    const body = ['```bash', 'npm install', 'npm run dev', '```'].join('\n');
    expect(autoFenceCommandLines(body)).toBe(body);
  });

  it('inserts a blank line before the fence when the preceding line is not already blank', () => {
    const body = 'Run this now:\nnpm run build';
    const result = autoFenceCommandLines(body);
    expect(result).toBe('Run this now:\n\n```bash\nnpm run build\n```');
  });

  it('inserts a blank line after the fence when the following line is not already blank', () => {
    const body = 'npm run build\nThat completes the setup.';
    const result = autoFenceCommandLines(body);
    expect(result).toBe('```bash\nnpm run build\n```\n\nThat completes the setup.');
  });

  it('returns non-string input unchanged rather than throwing', () => {
    expect(autoFenceCommandLines(undefined)).toBeUndefined();
    expect(autoFenceCommandLines(null)).toBeNull();
  });

  it('returns an empty string unchanged', () => {
    expect(autoFenceCommandLines('')).toBe('');
  });
});
