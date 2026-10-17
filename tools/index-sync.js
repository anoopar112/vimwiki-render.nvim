#!/usr/bin/env node
/**
 * Vimwiki Auto-Index Synchronizer
 * Automatically discovers new or unindexed files in every folder and adds clean, formatted links to the folder's index.md.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.env.VIMWIKI_DIR ? path.resolve(process.env.VIMWIKI_DIR) : path.resolve(__dirname, '..');
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'pdf', 'tools', '.git', '.gemini', 'scratch']);

/**
 * Recursively find all content directories
 */
function getAllDirectories(dir = ROOT_DIR, list = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let hasMdFiles = false;

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        getAllDirectories(path.join(dir, entry.name), list);
      }
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      hasMdFiles = true;
    }
  }

  if (hasMdFiles) {
    list.push(dir);
  }
  return list;
}

/**
 * Extract a clean, human-readable title and optional description from a markdown file
 */
function extractTitleAndDesc(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let title = '';
  let desc = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!title && line.match(/^#+\s+/)) {
      title = line.replace(/^#+\s+/, '').replace(/[#*_`]/g, '').replace(/:$/, '').trim();
      // Capitalize first letter of words if all lowercase
      if (title === title.toLowerCase()) {
        title = title.replace(/\b\w/g, c => c.toUpperCase());
      }
      // Look for a short description on following lines
      for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
        const nextLine = lines[j].trim();
        if (nextLine && !nextLine.startsWith('#') && !nextLine.startsWith('>') && !nextLine.startsWith('*') && !nextLine.startsWith('-') && !nextLine.startsWith('[')) {
          desc = nextLine.replace(/[#*_`]/g, '').trim();
          if (desc.length > 90) desc = desc.slice(0, 87) + '...';
          break;
        }
      }
      break;
    }
  }

  // Handle special naming conventions like GN-B1-SEP-17 or GN-B1-16-26
  const baseName = path.basename(filePath, '.md');
  const gnMatch = baseName.match(/^GN-B1-(.+)$/i);
  if (gnMatch) {
    let dateStr = gnMatch[1];
    if (dateStr.toUpperCase() === 'SEP-17') dateStr = '17.09.2026';
    else if (dateStr.toUpperCase() === 'SEP-15-26') dateStr = '15.09.2026';
    else if (dateStr === '16-26') dateStr = '16.09.2026';

    if (title && !title.startsWith('B1:')) {
      title = `B1: ${title} (${dateStr})`;
    } else if (!title) {
      title = `B1 Course Notes (${dateStr})`;
    }
  }

  // Fallback to formatted filename
  if (!title) {
    title = baseName
      .replace(/\.task$/, '')
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  // Handle common uppercase abbreviations
  title = title
    .replace(/\bVm\b/g, 'VM')
    .replace(/\bUi\b/g, 'UI')
    .replace(/\bApi\b/g, 'API')
    .replace(/\bFe\b/g, 'FE')
    .replace(/\bTodos\b/g, 'Sprint Tasks & Backlog')
    .replace(/\bDe\b/g, 'German');

  return { title, desc };
}

/**
 * Check if a file is already referenced in the index content
 */
function isFileReferenced(indexContent, filename) {
  const escaped = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(\\(\\s*\\.?\\/?${escaped}|\\/\\s*${escaped}|\\b${escaped}\\b)`, 'i');
  return regex.test(indexContent);
}

/**
 * Intelligent section matcher to find where a file belongs
 */
function findBestSection(indexContent, filename, title) {
  const fnLower = filename.toLowerCase();
  const titleLower = title.toLowerCase();

  // Keyword rules prioritized by specificity
  const rules = [
    { pattern: /^gn-b1|course/i, section: /## course notes/i },
    { pattern: /todo|task|backlog/i, section: /###? task/i },
    { pattern: /photo|foto|notebook/i, section: /## notebook photos/i },
    { pattern: /video|episode|streaming/i, section: /## videos/i },
    { pattern: /project|service|dashboard/i, section: /###? project/i },
    { pattern: /case|präposition|verb|wortschatz/i, section: /###? (cases|präpositionen|wortschatz|grammar)/i },
    { pattern: /guide|tip|cheat/i, section: /## (guides|tips)/i }
  ];

  for (const rule of rules) {
    if (rule.pattern.test(fnLower) || rule.pattern.test(titleLower)) {
      const lines = indexContent.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#') && rule.section.test(line)) {
          return { lineIndex: i, heading: line };
        }
      }
    }
  }

  // Check general notes / content sections
  const generalRegex = /## (course notes|notes|guides|documents|content sections|reference|content)/i;
  const lines = indexContent.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('#') && generalRegex.test(lines[i])) {
      return { lineIndex: i, heading: lines[i] };
    }
  }

  return null;
}

/**
 * Insert link into index content cleanly
 */
function insertLinkIntoIndex(indexContent, filename, title, desc) {
  const linkText = desc ? `* [${title}](./${filename}) – ${desc}` : `* [${title}](./${filename})`;
  const lines = indexContent.split('\n');

  // Try to find matching section
  const matchedSection = findBestSection(indexContent, filename, title);

  if (matchedSection) {
    const sectionLevel = (matchedSection.heading.match(/^#+/) || ['##'])[0].length;
    let insertLine = matchedSection.lineIndex + 1;
    let lastBulletLine = -1;

    for (let i = matchedSection.lineIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#+)\s+/);
      if (headingMatch && headingMatch[1].length <= sectionLevel) {
        break;
      }
      if (line.trim() === '---') {
        break;
      }
      if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
        lastBulletLine = i;
        insertLine = i + 1;
      }
    }

    if (lastBulletLine !== -1) {
      const indentMatch = lines[lastBulletLine].match(/^(\s*)[*-]/);
      const indent = indentMatch ? indentMatch[1] : '';
      const formattedLink = `${indent}${linkText.trim()}`;
      lines.splice(insertLine, 0, formattedLink);
      return lines.join('\n');
    } else {
      lines.splice(matchedSection.lineIndex + 1, 0, '', linkText);
      return lines.join('\n');
    }
  }

  // Fallback: Insert right before the last footer '---'
  let footerIndex = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '---') {
      footerIndex = i;
      break;
    }
  }

  if (footerIndex !== -1) {
    let insertAt = footerIndex;
    while (insertAt > 0 && lines[insertAt - 1].trim() === '') {
      insertAt--;
    }
    lines.splice(insertAt, 0, linkText);
    return lines.join('\n');
  }

  // No footer divider, append to the end
  lines.push('', '## Additional Notes', linkText);
  return lines.join('\n');
}

/**
 * Generate a fresh starter index.md if a directory has no index file
 */
function createStarterIndex(dirPath, files) {
  const dirRel = path.relative(ROOT_DIR, dirPath);
  const dirName = path.basename(dirPath).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const depth = dirRel.split(path.sep).length;
  const parentRel = depth === 1 ? '../index.md' : '../'.repeat(depth) + 'index.md';
  const homeRel = '../'.repeat(depth) + 'index.md';

  let content = `[Parent](${parentRel}) | [Home](${homeRel})\n\n# ${dirName}\n\nWelcome to the ${dirName} section.\n\n## Documents\n`;

  for (const f of files) {
    const { title, desc } = extractTitleAndDesc(path.join(dirPath, f));
    content += desc ? `* [${title}](./${f}) – ${desc}\n` : `* [${title}](./${f})\n`;
  }

  content += `\n---\n[Back](${parentRel}) | [Home](${homeRel})\n`;
  fs.writeFileSync(path.join(dirPath, 'index.md'), content, 'utf8');
}

/**
 * Main synchronizer function
 */
function syncAllIndexes(options = { verbose: false }) {
  const dirs = getAllDirectories();
  const results = {
    added: [],
    created: [],
    totalChecked: 0
  };

  for (const dir of dirs) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const mdFiles = entries
      .filter(e => e.isFile() && e.name.endsWith('.md') && e.name !== 'index.md' && e.name !== 'navigation.md')
      .map(e => e.name);

    if (mdFiles.length === 0) continue;
    results.totalChecked += mdFiles.length;

    const indexPath = path.join(dir, 'index.md');

    // Case 1: Directory has no index.md at all
    if (!fs.existsSync(indexPath)) {
      createStarterIndex(dir, mdFiles);
      const relIndex = path.relative(ROOT_DIR, indexPath);
      results.created.push(relIndex);
      if (options.verbose) console.log(`✨ Created missing index: ${relIndex}`);
      continue;
    }

    // Case 2: index.md exists, check for unindexed files
    let indexContent = fs.readFileSync(indexPath, 'utf8');
    let modified = false;

    for (const filename of mdFiles) {
      if (!isFileReferenced(indexContent, filename)) {
        const filePath = path.join(dir, filename);
        const { title, desc } = extractTitleAndDesc(filePath);
        indexContent = insertLinkIntoIndex(indexContent, filename, title, desc);
        modified = true;

        const relPath = path.relative(ROOT_DIR, filePath);
        const relIndex = path.relative(ROOT_DIR, indexPath);
        results.added.push({ file: relPath, index: relIndex, title });

        if (options.verbose) {
          console.log(`📌 Indexed: ${relPath} -> ${relIndex} as "${title}"`);
        }
      }
    }

    if (modified) {
      fs.writeFileSync(indexPath, indexContent, 'utf8');
    }
  }

  return results;
}

// CLI execution
if (require.main === module) {
  console.log('🔍 Checking for unindexed markdown files...');
  const results = syncAllIndexes({ verbose: true });

  if (results.added.length === 0 && results.created.length === 0) {
    console.log(`✅ All ${results.totalChecked} files across all directories are properly indexed!`);
  } else {
    console.log(`\n🎉 Successfully synchronized:`);
    if (results.created.length > 0) {
      console.log(`   Created ${results.created.length} new index.md file(s).`);
    }
    if (results.added.length > 0) {
      console.log(`   Added ${results.added.length} unindexed file(s) to their respective folder index.`);
    }
  }
}

module.exports = { syncAllIndexes, extractTitleAndDesc };
