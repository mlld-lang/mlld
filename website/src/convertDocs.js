const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ATOMS_DIR = path.join(__dirname, '../../docs/src/atoms');
const EXPLAINERS_DIR = path.join(__dirname, '../../docs/src/explainers');
const OUTPUT_DIR = path.join(__dirname, 'docs');

// Website-specific overrides per section directory.
// navOrder controls sidebar ordering. titleOverride replaces the _index.md title.
// Sections not listed here get navOrder 1000 and use their _index.md title.
const SECTION_META = {
  'cli':            { navOrder: 10, titleOverride: 'CLI' },
  'config':         { navOrder: 20, titleOverride: 'Configuration' },
  'core':           { navOrder: 30 },
  'effects':        { navOrder: 40 },
  'flow-control':   { navOrder: 50, titleOverride: 'Flow Control' },
  'mcp':            { navOrder: 60, titleOverride: 'MCP' },
  'modules':        { navOrder: 70 },
  'output':         { navOrder: 80 },
  'patterns':       { navOrder: 90 },
  'sdk':            { navOrder: 100, titleOverride: 'SDK' },
  'security':       { navOrder: 110 },
};

// --- Helpers ---

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  try {
    return yaml.load(match[1]) || {};
  } catch {
    return {};
  }
}

function stripFrontmatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n*/, '');
}

function stripTldr(content) {
  return content.replace(/## tldr\n[\s\S]*?(?=\n## |\n$|$)/, '').trim();
}

function shiftHeadings(content, levels) {
  return content.replace(/^(#{1,6})\s/gm, (match, hashes) => {
    const newLevel = Math.min(hashes.length + levels, 6);
    return '#'.repeat(newLevel) + ' ';
  });
}

const ACRONYMS = { mcp: 'MCP', sdk: 'SDK', cli: 'CLI' };

// mlld keywords that should stay lowercase in headings
const LOWERCASE_KEYWORDS = new Set([
  'exe', 'run', 'var', 'let', 'cmd', 'sh', 'js', 'py', 'node',
  'when', 'for', 'if', 'while', 'loop', 'foreach', 'bail',
  'import', 'export', 'show', 'log', 'append',
  'guard', 'policy', 'hook', 'env',
]);

function titleCase(str) {
  return str.split('-').map(w => ACRONYMS[w] || w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Display name for parent group headings.
// Keeps mlld keywords lowercase, titlecases concept names.
function parentDisplayName(parentStr) {
  if (LOWERCASE_KEYWORDS.has(parentStr)) return parentStr;
  return titleCase(parentStr);
}

// --- File sorting ---
// _index.md first, then NN-* numerically, then unnumbered alphabetically

function sortAtomFiles(files) {
  return files.slice().sort((a, b) => {
    if (a === '_index.md') return -1;
    if (b === '_index.md') return 1;

    const numA = a.match(/^(\d+)-/);
    const numB = b.match(/^(\d+)-/);

    // Both numbered → sort numerically
    if (numA && numB) return parseInt(numA[1]) - parseInt(numB[1]);
    // Numbered before unnumbered
    if (numA) return -1;
    if (numB) return 1;
    // Both unnumbered → alphabetical
    return a.localeCompare(b);
  });
}

// --- Filename parsing ---
// "07-file-loading--basics.md" → { parent: "file-loading", child: "basics", isBasics: true }
// "27-comments.md" → { parent: null, child: null, name: "comments" }
// "_index.md" → { isIndex: true }

function parseAtomFilename(filename) {
  if (filename === '_index.md') return { isIndex: true };

  // Strip numeric prefix and .md extension
  const name = filename.replace(/^\d+-/, '').replace(/\.md$/, '');

  const dashIdx = name.indexOf('--');
  if (dashIdx !== -1) {
    const parent = name.substring(0, dashIdx);
    const child = name.substring(dashIdx + 2);
    return { parent, child, isBasics: child === 'basics' };
  }

  return { name };
}

// --- Section builder ---

function buildSectionPage(sectionDir, sectionId) {
  const dirPath = path.join(ATOMS_DIR, sectionDir);
  if (!fs.existsSync(dirPath)) {
    console.error(`Section directory not found: ${dirPath}`);
    return null;
  }

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md'));
  const sorted = sortAtomFiles(files);

  // Read _index.md for section title and intro
  const meta = SECTION_META[sectionDir] || {};
  let title = meta.titleOverride || null;
  let intro = '';
  let navOrder = meta.navOrder || 1000;

  const indexPath = path.join(dirPath, '_index.md');
  if (fs.existsSync(indexPath)) {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    const indexFm = parseFrontmatter(indexContent);
    if (!title && indexFm.title) title = indexFm.title;
    // Check for navOrder in _index.md frontmatter (overrides SECTION_META)
    if (indexFm.navOrder != null) navOrder = indexFm.navOrder;
    intro = shiftHeadings(stripFrontmatter(indexContent).trim(), 1);
  }

  if (!title) title = titleCase(sectionDir);

  // Group atoms by parent
  // We walk files in order, building groups as we encounter them.
  // Consecutive files with the same parent form a group.
  // Standalone files (no --) are their own group.
  const groups = []; // { type: 'parent', parent, children: [{fm, body, child, isBasics}] } or { type: 'standalone', fm, body }
  let currentParent = null;
  let currentChildren = [];

  function flushParent() {
    if (currentParent && currentChildren.length > 0) {
      groups.push({ type: 'parent', parent: currentParent, children: currentChildren });
    }
    currentParent = null;
    currentChildren = [];
  }

  for (const file of sorted) {
    const parsed = parseAtomFilename(file);
    if (parsed.isIndex) continue; // already handled

    const filePath = path.join(dirPath, file);
    const raw = fs.readFileSync(filePath, 'utf8');
    const fm = parseFrontmatter(raw);
    const body = stripTldr(stripFrontmatter(raw)).trim();

    if (parsed.parent) {
      // Parent-child atom
      if (parsed.parent !== currentParent) {
        flushParent();
        currentParent = parsed.parent;
      }
      currentChildren.push({ fm, body, child: parsed.child, isBasics: parsed.isBasics });
    } else {
      // Standalone atom
      flushParent();
      groups.push({ type: 'standalone', fm, body, name: parsed.name });
    }
  }
  flushParent();

  // Build page sections
  const sections = [];

  for (const group of groups) {
    if (group.type === 'standalone') {
      const atomTitle = group.fm.title || titleCase(group.name);
      const experimental = group.fm.experimental ? ' {.experimental}' : '';
      sections.push(`## ${atomTitle}${experimental}\n\n${shiftHeadings(group.body, 1)}`);
    } else {
      const parentTitle = parentDisplayName(group.parent);
      let groupContent = `## ${parentTitle}`;

      const childSections = [];
      for (const child of group.children) {
        const experimental = child.fm.experimental ? ' {.experimental}' : '';
        if (child.isBasics) {
          // --basics: content flows directly under ## Parent, no ### heading
          childSections.push(shiftHeadings(child.body, 1));
        } else {
          const childTitle = child.fm.title || titleCase(child.child);
          childSections.push(`### ${childTitle}${experimental}\n\n${shiftHeadings(child.body, 2)}`);
        }
      }

      if (childSections.length > 0) {
        groupContent += '\n\n' + childSections.join('\n\n');
      }
      sections.push(groupContent);
    }
  }

  // Assemble page
  const outputFm = [
    '---',
    'layout: docs.njk',
    `title: "${title}"`,
    'type: category',
    `order: ${navOrder}`,
    '---'
  ].join('\n');

  let pageContent = outputFm + '\n\n';
  if (intro) {
    pageContent += intro + '\n\n';
  }
  pageContent += sections.join('\n\n') + '\n';

  return { filename: sectionDir + '.md', content: pageContent };
}

// --- Explainers ---

function processExplainers() {
  if (!fs.existsSync(EXPLAINERS_DIR)) {
    console.warn('Explainers directory not found:', EXPLAINERS_DIR);
    return;
  }

  const files = fs.readdirSync(EXPLAINERS_DIR).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(EXPLAINERS_DIR, file), 'utf8');
    const outputPath = path.join(OUTPUT_DIR, file);
    fs.writeFileSync(outputPath, content);
    console.log(`Explainer: ${file}`);
  }
}

// --- Main ---

function main() {
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Processing explainers...');
  processExplainers();

  // Discover section directories from filesystem
  const entries = fs.readdirSync(ATOMS_DIR, { withFileTypes: true });
  const sectionDirs = entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort(); // alphabetical: cli, config, core, effects, flow-control, ...

  console.log('\nBuilding section pages...');
  for (const sectionDir of sectionDirs) {
    console.log(`\nSection: ${sectionDir}`);
    const result = buildSectionPage(sectionDir, sectionDir);
    if (result) {
      const outputPath = path.join(OUTPUT_DIR, result.filename);
      fs.writeFileSync(outputPath, result.content);
      console.log(`  → ${result.filename}`);
    }
  }

  console.log('\nDocumentation conversion complete!');
}

main();
