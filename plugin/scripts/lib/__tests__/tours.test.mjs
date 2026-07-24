import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadTour } from '../tours.mjs';

const tmpDirs = [];

function writeTmpTour(fileName, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodocs-tours-test-'));
  fs.writeFileSync(path.join(dir, fileName), contents);
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), { recursive: true, force: true });
});

describe('loadTour', () => {
  it('loads a valid tour with goto/capture/click steps', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      `
id: demo
steps:
  - action: goto
    path: /demo
  - capture: demo-full
    description: "Full page"
  - action: click
    selector: "role=button[name='Go']"
`,
    );
    const tour = loadTour(dir, 'demo');
    expect(tour.id).toBe('demo');
    expect(tour.steps).toHaveLength(3);
  });

  it('throws when the tour file does not exist', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodocs-tours-test-'));
    tmpDirs.push(dir);
    expect(() => loadTour(dir, 'missing')).toThrow(/not found/);
  });

  it('throws when "id" is missing', () => {
    const dir = writeTmpTour('demo.yaml', 'steps:\n  - action: goto\n    path: /demo\n');
    expect(() => loadTour(dir, 'demo')).toThrow(/"id"/);
  });

  it('throws when "steps" is missing or empty', () => {
    const dir = writeTmpTour('demo.yaml', 'id: demo\nsteps: []\n');
    expect(() => loadTour(dir, 'demo')).toThrow(/steps/);
  });

  it('throws when a step is not a valid goto/click/capture', () => {
    const dir = writeTmpTour('demo.yaml', 'id: demo\nsteps:\n  - action: fly\n');
    expect(() => loadTour(dir, 'demo')).toThrow(/step 0 is invalid/);
  });

  it('throws when the requested tour id contains path-traversal characters', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodocs-tours-test-'));
    tmpDirs.push(dir);
    expect(() => loadTour(dir, '../../etc/passwd')).toThrow(/invalid/);
    expect(() => loadTour(dir, '../../etc/passwd')).toThrow(/kebab-case/);
  });

  it('throws when the YAML body\'s own "id" field is not a safe slug', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: "../../escape"\nsteps:\n  - action: goto\n    path: /demo\n',
    );
    expect(() => loadTour(dir, 'demo')).toThrow(/kebab-case/);
  });

  it('throws when a goto step targets an absolute URL instead of a site-relative path', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - action: goto\n    path: "https://evil.example/phish"\n',
    );
    expect(() => loadTour(dir, 'demo')).toThrow(/site-relative/);
  });

  it('throws when a goto step targets a protocol-relative URL', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - action: goto\n    path: "//evil.example/phish"\n',
    );
    expect(() => loadTour(dir, 'demo')).toThrow(/site-relative/);
  });

  it('throws when a capture step name contains path-traversal characters', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - capture: "../../../../tmp/pwned"\n    description: "x"\n',
    );
    expect(() => loadTour(dir, 'demo')).toThrow(/kebab-case/);
  });

  it('throws when a capture step name is not a safe slug', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - capture: "Not Kebab Case!"\n    description: "x"\n',
    );
    expect(() => loadTour(dir, 'demo')).toThrow(/kebab-case/);
  });

  it('loads a valid upload step', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - action: upload\n    selector: "input[type=\'file\']"\n    file: fixtures/sample.pcap\n',
    );
    const tour = loadTour(dir, 'demo');
    expect(tour.steps[0]).toEqual({
      action: 'upload',
      selector: "input[type='file']",
      file: 'fixtures/sample.pcap',
    });
  });

  it('accepts a nested fixture path', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - action: upload\n    selector: "input[type=\'file\']"\n    file: fixtures/pcap/sample.pcap\n',
    );
    const tour = loadTour(dir, 'demo');
    expect(tour.steps[0].file).toBe('fixtures/pcap/sample.pcap');
  });

  it('throws when an upload step\'s file does not start with "fixtures/"', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - action: upload\n    selector: "input[type=\'file\']"\n    file: sample.pcap\n',
    );
    expect(() => loadTour(dir, 'demo')).toThrow(/must be a path starting with "fixtures\//);
  });

  it('throws when an upload step\'s file contains a ".." traversal segment', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - action: upload\n    selector: "input[type=\'file\']"\n    file: "fixtures/../../../../etc/passwd"\n',
    );
    expect(() => loadTour(dir, 'demo')).toThrow(/no "\." or "\.\." segments/);
  });

  it('throws when an upload step\'s file contains a "." segment', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - action: upload\n    selector: "input[type=\'file\']"\n    file: "fixtures/./sample.pcap"\n',
    );
    expect(() => loadTour(dir, 'demo')).toThrow(/no "\." or "\.\." segments/);
  });

  it('throws when an upload step is missing a selector', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - action: upload\n    file: fixtures/sample.pcap\n',
    );
    expect(() => loadTour(dir, 'demo')).toThrow(/step 0 is invalid/);
  });

  it('loads a valid fill step', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - action: fill\n    selector: "role=textbox[name=\'Search\']"\n    value: "hello"\n',
    );
    const tour = loadTour(dir, 'demo');
    expect(tour.steps[0]).toEqual({ action: 'fill', selector: "role=textbox[name='Search']", value: 'hello' });
  });

  it('throws when a fill step is missing a value', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - action: fill\n    selector: "role=textbox[name=\'Search\']"\n',
    );
    expect(() => loadTour(dir, 'demo')).toThrow(/step 0 is invalid/);
  });

  it('loads a valid type step', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - action: type\n    selector: "[contenteditable=\'true\']"\n    value: "hello"\n',
    );
    const tour = loadTour(dir, 'demo');
    expect(tour.steps[0].value).toBe('hello');
  });

  it('throws when a type step is missing a value', () => {
    const dir = writeTmpTour('demo.yaml', 'id: demo\nsteps:\n  - action: type\n    selector: "x"\n');
    expect(() => loadTour(dir, 'demo')).toThrow(/step 0 is invalid/);
  });

  it('loads a valid select step', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - action: select\n    selector: "role=combobox[name=\'Status\']"\n    value: "done"\n',
    );
    const tour = loadTour(dir, 'demo');
    expect(tour.steps[0]).toEqual({ action: 'select', selector: "role=combobox[name='Status']", value: 'done' });
  });

  it('throws when a select step is missing a value', () => {
    const dir = writeTmpTour('demo.yaml', 'id: demo\nsteps:\n  - action: select\n    selector: "x"\n');
    expect(() => loadTour(dir, 'demo')).toThrow(/step 0 is invalid/);
  });

  it('loads a valid check step with an explicit checked value', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - action: check\n    selector: "role=checkbox[name=\'Agree\']"\n    checked: false\n',
    );
    const tour = loadTour(dir, 'demo');
    expect(tour.steps[0]).toEqual({ action: 'check', selector: "role=checkbox[name='Agree']", checked: false });
  });

  it('loads a valid check step with checked omitted', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - action: check\n    selector: "role=checkbox[name=\'Agree\']"\n',
    );
    const tour = loadTour(dir, 'demo');
    expect(tour.steps[0].checked).toBeUndefined();
  });

  it('throws when a check step\'s checked field is not a boolean', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - action: check\n    selector: "x"\n    checked: "yes"\n',
    );
    expect(() => loadTour(dir, 'demo')).toThrow(/step 0 is invalid/);
  });

  it('loads a valid press step', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - action: press\n    selector: "role=textbox[name=\'Message\']"\n    key: "Enter"\n',
    );
    const tour = loadTour(dir, 'demo');
    expect(tour.steps[0]).toEqual({ action: 'press', selector: "role=textbox[name='Message']", key: 'Enter' });
  });

  it('throws when a press step is missing a key', () => {
    const dir = writeTmpTour('demo.yaml', 'id: demo\nsteps:\n  - action: press\n    selector: "x"\n');
    expect(() => loadTour(dir, 'demo')).toThrow(/step 0 is invalid/);
  });

  it('loads a valid hover step', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - action: hover\n    selector: "role=button[name=\'Info\']"\n',
    );
    const tour = loadTour(dir, 'demo');
    expect(tour.steps[0]).toEqual({ action: 'hover', selector: "role=button[name='Info']" });
  });

  it('throws when a hover step is missing a selector', () => {
    const dir = writeTmpTour('demo.yaml', 'id: demo\nsteps:\n  - action: hover\n');
    expect(() => loadTour(dir, 'demo')).toThrow(/step 0 is invalid/);
  });

  it('loads a valid wait step', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - action: wait\n    selector: "role=status"\n    state: visible\n',
    );
    const tour = loadTour(dir, 'demo');
    expect(tour.steps[0]).toEqual({ action: 'wait', selector: 'role=status', state: 'visible' });
  });

  it('throws when a wait step\'s state is not a recognized Playwright waitFor state', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\nsteps:\n  - action: wait\n    selector: "role=status"\n    state: "invisible"\n',
    );
    expect(() => loadTour(dir, 'demo')).toThrow(/step 0 is invalid/);
  });

  it('loads a tour with a valid preconditions.voice fixture path', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\npreconditions:\n  voice: fixtures/sample-voice.wav\nsteps:\n  - action: goto\n    path: /\n',
    );
    const tour = loadTour(dir, 'demo');
    expect(tour.preconditions.voice).toBe('fixtures/sample-voice.wav');
  });

  it('throws when preconditions.voice does not start with "fixtures/"', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\npreconditions:\n  voice: sample-voice.wav\nsteps:\n  - action: goto\n    path: /\n',
    );
    expect(() => loadTour(dir, 'demo')).toThrow(/must be a path starting with "fixtures\//);
  });

  it('throws when preconditions.voice contains a ".." traversal segment', () => {
    const dir = writeTmpTour(
      'demo.yaml',
      'id: demo\npreconditions:\n  voice: "fixtures/../../../../etc/passwd"\nsteps:\n  - action: goto\n    path: /\n',
    );
    expect(() => loadTour(dir, 'demo')).toThrow(/no "\." or "\.\." segments/);
  });
});
