const KEEP_START = '<!-- autodocs:keep -->';
const KEEP_END = '<!-- /autodocs:keep -->';
const KEEP_REGION_RE = /<!-- autodocs:keep -->([\s\S]*?)<!-- \/autodocs:keep -->/;

export function extractKeepRegion(markdown) {
  const match = markdown?.match(KEEP_REGION_RE);
  return match ? match[1].trim() : null;
}

// Preserves the human-authored keep-region from `previousMarkdown` (if any)
// by splicing it into `newMarkdown`'s keep-region, so regeneration never
// clobbers human edits. `newMarkdown` must already contain one keep-region
// block (see renderTourPage).
export function applyKeepRegion(newMarkdown, previousMarkdown) {
  const previousContent = extractKeepRegion(previousMarkdown);
  if (previousContent === null) return newMarkdown;
  return newMarkdown.replace(KEEP_REGION_RE, `${KEEP_START}\n${previousContent}\n${KEEP_END}`);
}

export function renderTourPage({ title, intent, steps, keepRegionPlaceholder }) {
  const stepBlocks = steps.map((step, index) => {
    const lines = [`${index + 1}. **${step.description}**`, ''];
    if (step.imagePath) lines.push(`   ![${step.description}](${step.imagePath})`, '');
    lines.push(`   ${step.paragraph}`);
    return lines.join('\n');
  });

  return [
    `# ${title}`,
    '',
    intent,
    '',
    '## Steps',
    '',
    stepBlocks.join('\n\n'),
    '',
    KEEP_START,
    keepRegionPlaceholder ?? '<!-- Notes added here are preserved across regeneration. -->',
    KEEP_END,
    '',
  ].join('\n');
}
