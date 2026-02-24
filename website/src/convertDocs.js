const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ATOMS_DIR = path.join(__dirname, '../../docs/src/atoms');
const EXPLAINERS_DIR = path.join(__dirname, '../../docs/src/explainers');
const OUTPUT_DIR = path.join(__dirname, 'docs');

// Shared atom ordering config — single source of truth for both LLM and website docs.
const sharedConfig = require('../../docs/build/categories.json');

// Website-specific metadata layered on top of the shared config.
// The shared config defines page structure and atom ordering;
// this adds navOrder, titleOverride, and sources for the website build.
// Categories not listed here (mistakes, patterns) are LLM-only.
const WEBSITE_META = {
  'language-reference': { navOrder: 10, titleOverride: 'Language Reference', sources: ['syntax', 'commands'] },
  'flow-control':       { navOrder: 20, titleOverride: 'Flow Control' },
  'modules':            { navOrder: 30 },
  'cli':                { navOrder: 40, titleOverride: 'CLI', sources: ['configuration'] },
  'configuration':      { navOrder: 50 },
  'security':           { navOrder: 60 }
};

const CATEGORIES = {};
for (const [pageId, meta] of Object.entries(WEBSITE_META)) {
  CATEGORIES[pageId] = { ...sharedConfig[pageId], ...meta };
}

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

function readAtom(categoryDir, filename) {
  const filePath = path.join(categoryDir, filename + '.md');
  if (!fs.existsSync(filePath)) {
    console.warn(`  WARNING: Atom file not found: ${filePath}`);
    return null;
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const fm = parseFrontmatter(raw);
  const body = stripTldr(stripFrontmatter(raw)).trim();
  return { fm, body, filename };
}


function buildCategoryPage(categoryId, config) {
  // Determine which atom directories to use
  const atomDirs = (config.sources || [categoryId]).map(s => path.join(ATOMS_DIR, s));
  const primaryDir = atomDirs[0];

  if (!fs.existsSync(primaryDir)) {
    console.error(`Category directory not found: ${primaryDir}`);
    return null;
  }

  // Read _index.md for title and intro (from primary source)
  let title = config.titleOverride || categoryId.charAt(0).toUpperCase() + categoryId.slice(1);
  let intro = '';
  if (!config.titleOverride) {
    const indexPath = path.join(primaryDir, '_index.md');
    if (fs.existsSync(indexPath)) {
      const indexContent = fs.readFileSync(indexPath, 'utf8');
      const indexFm = parseFrontmatter(indexContent);
      if (indexFm.title) title = indexFm.title;
      intro = stripFrontmatter(indexContent).trim();
    }
  }

  const sections = [];

  for (const group of config.groups) {
    const categoryDir = group.source ? path.join(ATOMS_DIR, group.source) : primaryDir;

    if (group.standalone) {
      for (const atomName of group.atoms) {
        const atom = readAtom(categoryDir, atomName);
        if (!atom) continue;
        const atomTitle = atom.fm.title || atomName;
        sections.push(`## ${atomTitle}\n\n${shiftHeadings(atom.body, 1)}`);
      }
    } else {
      const parentName = group.parent;
      const parentTitle = parentName.charAt(0).toUpperCase() + parentName.slice(1).replace(/-/g, ' ');

      let parentIntro = '';
      const parentAtomPath = path.join(categoryDir, parentName + '.md');
      if (fs.existsSync(parentAtomPath) && !group.atoms.includes(parentName)) {
        const parentAtom = readAtom(categoryDir, parentName);
        if (parentAtom) {
          parentIntro = shiftHeadings(parentAtom.body, 1);
        }
      }

      const childSections = [];
      for (const atomName of group.atoms) {
        const atom = readAtom(categoryDir, atomName);
        if (!atom) continue;
        const atomTitle = atom.fm.title || atomName;
        childSections.push(`### ${atomTitle}\n\n${shiftHeadings(atom.body, 2)}`);
      }

      let groupContent = `## ${parentTitle}`;
      if (parentIntro) {
        groupContent += `\n\n${parentIntro}`;
      }
      if (childSections.length > 0) {
        groupContent += '\n\n' + childSections.join('\n\n');
      }
      sections.push(groupContent);
    }
  }

  const outputFm = [
    '---',
    'layout: docs.njk',
    `title: "${title}"`,
    'type: category',
    `order: ${config.navOrder}`,
    '---'
  ].join('\n');

  let pageContent = outputFm + '\n\n';
  if (intro) {
    pageContent += intro + '\n\n';
  }
  pageContent += sections.join('\n\n') + '\n';

  return { filename: categoryId + '.md', content: pageContent };
}

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

function main() {
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Processing explainers...');
  processExplainers();

  console.log('\nBuilding category pages...');
  for (const [categoryId, config] of Object.entries(CATEGORIES)) {
    console.log(`\nCategory: ${categoryId}`);
    const result = buildCategoryPage(categoryId, config);
    if (result) {
      const outputPath = path.join(OUTPUT_DIR, result.filename);
      fs.writeFileSync(outputPath, result.content);
      console.log(`  → ${result.filename}`);
    }
  }

  console.log('\nDocumentation conversion complete!');
}

main();
