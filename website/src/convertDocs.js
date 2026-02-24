const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ATOMS_DIR = path.join(__dirname, '../../docs/src/atoms');
const EXPLAINERS_DIR = path.join(__dirname, '../../docs/src/explainers');
const OUTPUT_DIR = path.join(__dirname, 'docs');

// Category ordering config derived from docs/build/llm/*.mld scripts.
// Each group either has a `parent` (atoms grouped under a shared heading)
// or `standalone: true` (atoms rendered as their own h2 sections).
//
// outputFilename overrides the default (categoryId.md).
// titleOverride overrides the _index.md title.
// Multi-source categories use `sources` array instead of implicit categoryId.
const CATEGORIES = {
  'language-reference': {
    navOrder: 10,
    titleOverride: 'Language Reference',
    sources: ['syntax', 'commands'],
    groups: [
      // Syntax groups
      { parent: 'variables', atoms: ['variables-basics', 'variables-conditional', 'variables-truthiness', 'payload'], source: 'syntax' },
      { parent: 'templates', atoms: ['templates-basics', 'templates-external', 'templates-loops'], source: 'syntax' },
      { parent: 'file-loading', atoms: ['file-loading-basics', 'file-loading-ast', 'file-loading-metadata', 'file-loading-json-accessors'], source: 'syntax' },
      { parent: 'escaping', atoms: ['escaping-basics', 'escaping-at', 'escaping-defaults'], source: 'syntax' },
      { parent: 'builtins', atoms: ['methods-builtin'], source: 'syntax' },
      { parent: 'pipelines', atoms: ['pipelines-basics', 'pipelines-context', 'pipelines-retry', 'pipelines-parallel'], source: 'syntax' },
      { standalone: true, atoms: ['comments', 'reserved-variables', 'builtins'], source: 'syntax' },
      // Commands groups
      { parent: 'run', atoms: ['run-basics', 'run-cwd', 'run-stdin', 'run-params'], source: 'commands' },
      { parent: 'exe', atoms: ['exe-simple', 'exe-metadata', 'exe-prose', 'exe-blocks', 'exe-when', 'exe-shadow'], source: 'commands' },
      { parent: 'commands', atoms: ['output', 'log', 'append', 'stream', 'hooks'], source: 'commands' },
      { standalone: true, atoms: ['mcp', 'mcp-export', 'mcp-import', 'mcp-tools', 'tool-reshaping', 'env-directive'], source: 'commands' },
      // Prose (moved from patterns)
      { standalone: true, atoms: ['prose'], source: 'patterns' }
    ]
  },
  'flow-control': {
    navOrder: 20,
    titleOverride: 'Flow Control',
    sources: ['control-flow'],
    groups: [
      { standalone: true, atoms: ['if'] },
      { parent: 'when', atoms: ['when-inline', 'when', 'when-value-returning', 'when-blocks', 'when-local-vars', 'when-operators'] },
      { parent: 'for', atoms: ['for-arrow', 'for-collection', 'for-block', 'for-filter', 'for-skip', 'for-object', 'for-nested', 'for-batch', 'for-parallel', 'for-context'] },
      { standalone: true, atoms: ['foreach', 'loop', 'while', 'bail', 'script-return', 'no-early-exit'] }
    ]
  },
  'modules': {
    navOrder: 30,
    groups: [
      { parent: 'modules', atoms: ['philosophy', 'creating', 'frontmatter-access', 'exporting', 'module-patterns', 'local-development', 'registry', 'resolvers', 'updating'] },
      { parent: 'importing', atoms: ['importing-registry', 'importing-local', 'importing-namespace', 'importing-directory', 'importing-node', 'import-types', 'import-templates'] },
      { standalone: true, atoms: ['module-structure'] }
    ]
  },
  'cli': {
    navOrder: 40,
    titleOverride: 'CLI',
    sources: ['configuration'],
    groups: [
      { parent: 'cli', atoms: ['cli-run', 'cli-file', 'checkpoint', 'validate-features', 'live-stdio', 'mcp-dev', 'plugin'] }
    ]
  },
  'configuration': {
    navOrder: 50,
    groups: [
      { parent: 'configuration', atoms: ['config-files', 'environment-variables', 'frontmatter', 'paths-urls'] }
    ]
  },
  'security': {
    navOrder: 60,
    groups: [
      { standalone: true, atoms: ['security-getting-started'] },
      { parent: 'labels', atoms: ['labels-overview', 'labels-sensitivity', 'labels-trust', 'labels-influenced', 'labels-source-auto', 'automatic-labels', 'label-tracking', 'label-modification'] },
      { parent: 'guards', atoms: ['guards-basics', 'guard-composition', 'guards-privileged', 'transform-with-allow', 'denied-handlers'] },
      { parent: 'policies', atoms: ['policies', 'policy-capabilities', 'policy-operations', 'policy-label-flow', 'policy-composition', 'policy-auth'] },
      { parent: 'signing', atoms: ['signing-overview', 'sign-verify', 'autosign-autoverify'] },
      { parent: 'mcp-security', atoms: ['mcp-security', 'mcp-policy', 'mcp-guards'] },
      { parent: 'environments', atoms: ['env-overview', 'env-config', 'env-blocks'] },
      { standalone: true, atoms: ['needs-declaration', 'profiles', 'auth', 'audit-log', 'tool-call-tracking'] },
      { parent: 'pattern', atoms: ['pattern-audit-guard', 'pattern-dual-audit'] }
    ]
  }
};

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

function resolveAtomDir(categoryId, group) {
  // If group specifies a source, use that directory; otherwise use the category's
  // own sources (first one) or fall back to categoryId itself
  if (group && group.source) {
    return path.join(ATOMS_DIR, group.source);
  }
  const config = CATEGORIES[categoryId];
  if (config && config.sources) {
    return path.join(ATOMS_DIR, config.sources[0]);
  }
  return path.join(ATOMS_DIR, categoryId);
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
