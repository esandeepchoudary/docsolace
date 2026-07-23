import fs from 'node:fs';
import path from 'node:path';
import { load as parseYaml } from 'js-yaml';

export function loadTour(toursDir, tourId) {
  const filePath = path.join(toursDir, `${tourId}.yaml`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Tour "${tourId}" not found at ${filePath}`);
  }

  const tour = parseYaml(fs.readFileSync(filePath, 'utf8'));

  if (!tour || typeof tour !== 'object') {
    throw new Error(`Tour "${tourId}" is empty or not a valid YAML object`);
  }
  if (!tour.id) {
    throw new Error(`Tour "${tourId}" is missing required "id" field`);
  }
  if (!Array.isArray(tour.steps) || tour.steps.length === 0) {
    throw new Error(`Tour "${tourId}" is missing required non-empty "steps" array`);
  }
  for (const [index, step] of tour.steps.entries()) {
    const isGoto = step.action === 'goto' && typeof step.path === 'string';
    const isClick = step.action === 'click' && typeof step.selector === 'string';
    const isCapture = typeof step.capture === 'string';
    if (!isGoto && !isClick && !isCapture) {
      throw new Error(
        `Tour "${tourId}" step ${index} is invalid: expected a goto/click action or a capture`,
      );
    }
  }

  return tour;
}
