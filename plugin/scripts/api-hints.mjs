// Prints JSON hints from a project's OpenAPI/Swagger spec (if any) for
// `/document map` — see lib/api-spec.mjs. Read-only, local files only.
import fs from 'node:fs';
import path from 'node:path';
import { loadApiHints } from './lib/api-spec.mjs';
import { SLUG_RE, loadTour } from './lib/tours.mjs';

const toursDir = path.join(process.cwd(), 'tours');
const tours = [];
if (fs.existsSync(toursDir)) {
  for (const f of fs.readdirSync(toursDir).filter((n) => n.endsWith('.yaml'))) {
    const id = f.replace(/\.yaml$/, '');
    if (!SLUG_RE.test(id)) continue;
    try {
      tours.push(loadTour(toursDir, id));
    } catch {
      tours.push({ id });
    }
  }
}
console.log(JSON.stringify(loadApiHints({ tours }), null, 2));
