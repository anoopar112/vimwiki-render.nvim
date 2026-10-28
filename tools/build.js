#!/usr/bin/env node
/**
 * Vimwiki Static HTML & Search Index Builder
 * Compiles all Markdown files into a modern, browsable static site with search, dark mode, TOC, and print styles.
 */

const fs = require('fs');
const path = require('path');
const { Marked } = require('marked');
const hljs = require('highlight.js');
const { syncAllIndexes } = require('./index-sync');

const ROOT_DIR = process.env.VIMWIKI_DIR ? path.resolve(process.env.VIMWIKI_DIR) : path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');
const ASSETS_SRC_DIR = path.resolve(__dirname, 'assets');
const ASSETS_DIST_DIR = path.resolve(DIST_DIR, 'assets');

// Directories to ignore when scanning for markdown files
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'pdf', 'tools', '.git', '.gemini', 'scratch']);

/**
 * Recursively find all markdown files
 */
function getMarkdownFiles(dir = ROOT_DIR, list = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        getMarkdownFiles(path.join(dir, entry.name), list);
      }
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      list.push(path.relative(ROOT_DIR, path.join(dir, entry.name)));
    }
  }
  return list;
}

/**
 * Format filename to title
 */
function filenameToTitle(fileRel) {
  const basename = path.basename(fileRel, '.md');
  if (basename === 'index') {
    const parent = path.dirname(fileRel);
    if (parent === '.' || parent === '') return 'Home';
    return parent.split(path.sep).pop().replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  return basename
    .replace(/\.task$/, ' Tasks')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Slugify heading text for anchors
 */
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Helper to escape HTML characters
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Create a configured marked instance
 */
function createMarkedParser() {
  const marked = new Marked({
    gfm: true,
    breaks: false
  });

  marked.use({
    renderer: {
      code({ text, lang }) {
        const validLang = lang && hljs.getLanguage(lang) ? lang : null;
        let highlighted = '';
        try {
          highlighted = validLang ? hljs.highlight(text, { language: validLang }).value : escapeHtml(text);
        } catch (e) {
          highlighted = escapeHtml(text);
        }
        const displayLang = lang || 'text';
        return `
<div class="code-block" data-lang="${displayLang}">
  <div class="code-header">
    <span class="code-lang">${displayLang}</span>
    <button class="copy-btn" onclick="copyCode(this)">Copy</button>
  </div>
  <pre><code class="hljs language-${displayLang}">${highlighted}</code></pre>
</div>`;
      },

      link({ href, title, text }) {
        let targetHref = href || '';
        // Convert relative .md links to .html
        if (targetHref && !targetHref.startsWith('http://') && !targetHref.startsWith('https://') && !targetHref.startsWith('mailto:')) {
          targetHref = targetHref.replace(/(\.md)(#.*)?$/, (match, p1, p2) => '.html' + (p2 || ''));
        }
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        return `<a href="${targetHref}"${titleAttr}>${text}</a>`;
      },

      heading({ tokens, depth }) {
        const rawText = this.parser.parseInline(tokens);
        const plainText = rawText.replace(/<[^>]*>/g, '');
        const id = slugify(plainText);

        if (depth === 1) {
          return `<h1 id="${id}">${rawText}</h1>`;
        }
        return `<h${depth} id="${id}"><a class="header-anchor" href="#${id}">#</a>${rawText}</h${depth}>`;
      },

      listitem(item) {
        if (item.task) {
          const checked = item.checked ? ' checked' : '';
          return `<li class="task-list-item"><input type="checkbox" disabled${checked}> <span>${this.parser.parse(item.tokens, false)}</span></li>`;
        }
        return `<li>${this.parser.parse(item.tokens, false)}</li>`;
      }
    }
  });

  return marked;
}

const CALLOUT_ICONS = {
  info: '<svg class="callout-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
  note: '<svg class="callout-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>',
  tip: '<svg class="callout-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M12 2a7 7 0 0 0-7 7c0 2.38 1.19 4.47 3 5.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26c1.81-1.27 3-3.36 3-5.74a7 7 0 0 0-7-7z"></path></svg>',
  important: '<svg class="callout-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>',
  warning: '<svg class="callout-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
  caution: '<svg class="callout-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
};

/**
 * Process GitHub style callouts (> [!NOTE], > [!INFO], > [!TIP], etc.)
 */
function processCallouts(html) {
  const calloutBlockRegex = /<blockquote>([\s\S]*?)<\/blockquote>/gi;
  return html.replace(calloutBlockRegex, (fullMatch, inner) => {
    const headerMatch = inner.match(/^\s*<p>\s*\[!(NOTE|INFO|TIP|IMPORTANT|WARNING|CAUTION)\]([^\n<]*)(?:\n|<br\s*\/?>)?/i);
    if (!headerMatch) return fullMatch;

    const type = headerMatch[1].toUpperCase();
    const lowerType = type.toLowerCase();
    const inlineText = headerMatch[2].trim();

    // Strip the callout marker from the inner HTML
    let body = inner.replace(/^\s*<p>\s*\[!(NOTE|INFO|TIP|IMPORTANT|WARNING|CAUTION)\][^\n<]*(?:\n|<br\s*\/?>)?/i, '<p>');
    body = body.replace(/^\s*<p>\s*<\/p>/i, '').trim();

    let displayTitle = lowerType.charAt(0).toUpperCase() + lowerType.slice(1);

    if (!body) {
      body = `<p>${inlineText}</p>`;
    } else if (inlineText) {
      displayTitle = inlineText;
    }

    if (!body.startsWith('<p>') && !body.startsWith('<ul') && !body.startsWith('<ol') && !body.startsWith('<pre') && !body.startsWith('<div')) {
      body = `<p>${body}`;
    }

    const iconSvg = CALLOUT_ICONS[lowerType] || CALLOUT_ICONS.note;

    return `
<div class="callout callout-${lowerType}">
  <div class="callout-title">
    <span class="callout-icon-wrapper">${iconSvg}</span>
    <span class="callout-label">${displayTitle}</span>
  </div>
  <div class="callout-body">${body}</div>
</div>`;
  });
}

/**
 * UI SVG Icons (Font Awesome / Modern Minimalist Vector Icons)
 */
const UI_ICONS = {
  // Navigation & Tree
  chevron: '<svg class="toggle-arrow-svg" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>',
  file: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>',
  index: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
  folder: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
  
  // Root items
  home: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
  sitemap: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon><line x1="8" y1="2" x2="8" y2="18"></line><line x1="16" y1="6" x2="16" y2="22"></line></svg>',
  diary: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',

  // Top Bar & Controls
  logo: '<svg class="brand-svg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path><line x1="9" y1="7" x2="15" y2="7"></line><line x1="9" y1="11" x2="13" y2="11"></line></svg>',
  search: '<svg class="btn-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
  menu: '<svg class="btn-svg-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>',
  pdf: '<svg class="btn-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"></path><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>',
  moon: '<svg class="btn-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>',
  sun: '<svg class="btn-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>',
  sidebarToggle: '<svg class="btn-svg-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>',

  // Section Specific SVGs
  user: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
  languages: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>',
  writing: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path></svg>',
  tasks: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>',
  kbase: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>',
  terminal: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>',
  devops: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>',
  code: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
  ai: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  video: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>',
  planning: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
  layers: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>',
  bookmark: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>',
  desktop: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>',
  web: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>',
  briefcase: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
  projects: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>',
  archive: '<svg class="nav-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>'
};

/**
 * Build Navigation Sidebar Tree
 */
function buildNavHierarchy(allFiles, currentFileRel) {
  const tree = {
    title: 'Root',
    files: [],
    dirs: {}
  };

  for (const fileRel of allFiles) {
    const parts = fileRel.split(path.sep);
    let curr = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!curr.dirs[part]) {
        curr.dirs[part] = { title: part, files: [], dirs: {} };
      }
      curr = curr.dirs[part];
    }
    curr.files.push(fileRel);
  }

  // Section display names & SVG icons
  const sectionMeta = {
    'personal': { name: 'Personal', icon: UI_ICONS.user },
    'personal/german': { name: 'German', icon: UI_ICONS.languages },
    'personal/writing': { name: 'Writing', icon: UI_ICONS.writing },
    'personal/tasks': { name: 'Personal Tasks', icon: UI_ICONS.tasks },
    'kbase': { name: 'Knowledge Base', icon: UI_ICONS.kbase },
    'kbase/linux': { name: 'Linux', icon: UI_ICONS.terminal },
    'kbase/devops': { name: 'DevOps', icon: UI_ICONS.devops },
    'kbase/development': { name: 'Development', icon: UI_ICONS.code },
    'kbase/ai': { name: 'AI', icon: UI_ICONS.ai },
    'youtube': { name: 'YouTube', icon: UI_ICONS.video },
    'youtube/planning': { name: 'Planning', icon: UI_ICONS.planning },
    'youtube/vue': { name: 'Vue 3 Series', icon: UI_ICONS.layers },
    'youtube/vimwiki': { name: 'Vimwiki Series', icon: UI_ICONS.bookmark },
    'youtube/desktop': { name: 'Desktop & Window Mgr', icon: UI_ICONS.desktop },
    'youtube/web': { name: 'Web Dev & Design', icon: UI_ICONS.web },
    'work': { name: 'Work', icon: UI_ICONS.briefcase },
    'work/tasks': { name: 'Work Tasks', icon: UI_ICONS.tasks },
    'work/projects': { name: 'Projects', icon: UI_ICONS.projects },
    'diary': { name: 'Diary', icon: UI_ICONS.diary },
    'archive': { name: 'Archive', icon: UI_ICONS.archive }
  };

  function getRootRel(fromFile) {
    const depth = fromFile.split(path.sep).length - 1;
    return depth === 0 ? './' : '../'.repeat(depth);
  }

  const rootRel = getRootRel(currentFileRel);

  function renderDir(dirNode, dirKey = '', depth = 0) {
    let html = '';
    const sortedSubdirs = Object.keys(dirNode.dirs).sort();

    for (const sub of sortedSubdirs) {
      const fullSubKey = dirKey ? `${dirKey}/${sub}` : sub;
      const meta = sectionMeta[fullSubKey] || {
        name: sub.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        icon: UI_ICONS.folder
      };

      const isParentOfCurrent = currentFileRel.startsWith(fullSubKey + '/');
      const sectionHtml = renderDir(dirNode.dirs[sub], fullSubKey, depth + 1);

      html += `
<div class="nav-section${isParentOfCurrent ? '' : ' collapsed'}" data-section="${fullSubKey}">
  <div class="nav-section-title">
    <span class="nav-section-label">
      <span class="nav-section-icon">${meta.icon}</span>
      <span>${escapeHtml(meta.name)}</span>
    </span>
    <span class="toggle-arrow">${UI_ICONS.chevron}</span>
  </div>
  <div class="nav-section-items">
    ${sectionHtml}
  </div>
</div>`;
    }

    // Render files in this directory
    const sortedFiles = [...dirNode.files].sort((a, b) => {
      if (a.endsWith('index.md')) return -1;
      if (b.endsWith('index.md')) return 1;
      return a.localeCompare(b);
    });

    for (const fileRel of sortedFiles) {
      const htmlRel = fileRel.replace(/\.md$/, '.html');
      const isActive = fileRel === currentFileRel;
      const title = filenameToTitle(fileRel);
      const isIndex = path.basename(fileRel) === 'index.md';
      const iconSvg = isIndex ? UI_ICONS.index : UI_ICONS.file;

      html += `
<a href="${rootRel + htmlRel}" class="nav-link${isActive ? ' active' : ''}" title="${escapeHtml(title)}">
  <span class="nav-link-icon">${iconSvg}</span>
  <span class="nav-link-text">${escapeHtml(title)}</span>
</a>`;
    }

    return html;
  }

  // Root top links
  let rootHtml = `
<a href="${rootRel}index.html" class="nav-link${currentFileRel === 'index.md' ? ' active' : ''}" title="Home">
  <span class="nav-link-icon">${UI_ICONS.home}</span>
  <span class="nav-link-text">Home</span>
</a>
<a href="${rootRel}navigation.html" class="nav-link${currentFileRel === 'navigation.md' ? ' active' : ''}" title="Site Map">
  <span class="nav-link-icon">${UI_ICONS.sitemap}</span>
  <span class="nav-link-text">Site Map</span>
</a>
<a href="${rootRel}diary/diary.html" class="nav-link${currentFileRel === 'diary/diary.md' ? ' active' : ''}" title="Daily Diary">
  <span class="nav-link-icon">${UI_ICONS.diary}</span>
  <span class="nav-link-text">Daily Diary</span>
</a>`;

  rootHtml += renderDir(tree);
  return rootHtml;
}

/**
 * Extract Table of Contents
 */
function extractTOC(markdown) {
  const headingRegex = /^(#{2,3})\s+(.*)$/gm;
  const toc = [];
  let match;
  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length;
    const rawText = match[2].trim();
    const plainText = rawText.replace(/\[(.*?)\]\(.*?\)/g, '$1').replace(/[#*_`]/g, '');
    const id = slugify(plainText);
    toc.push({ level, text: plainText, id });
  }
  return toc;
}

/**
 * Generate Breadcrumbs HTML
 */
function buildBreadcrumbs(fileRel) {
  const depth = fileRel.split(path.sep).length - 1;
  const rootRel = depth === 0 ? './' : '../'.repeat(depth);
  const parts = fileRel.split(path.sep);

  let html = `<a href="${rootRel}index.html">Home</a>`;
  let accum = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    accum += (accum ? '/' : '') + part;

    if (i === parts.length - 1) {
      const title = filenameToTitle(fileRel);
      html += ` <span class="separator">/</span> <span class="current">${escapeHtml(title)}</span>`;
    } else {
      const name = part.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const sectionRel = rootRel + accum + '/index.html';
      html += ` <span class="separator">/</span> <a href="${sectionRel}">${escapeHtml(name)}</a>`;
    }
  }

  return html;
}

/**
 * Compile a single markdown file to HTML
 */
function compileFile(fileRel, allFiles, markedParser) {
  const fullPath = path.join(ROOT_DIR, fileRel);
  const rawContent = fs.readFileSync(fullPath, 'utf-8');

  // Extract page title
  const h1Match = rawContent.match(/^#\s+(.*)$/m);
  const pageTitle = h1Match ? h1Match[1].replace(/[#*_`]/g, '').trim() : filenameToTitle(fileRel);

  // TOC
  const toc = extractTOC(rawContent);

  // Parse HTML
  let parsedHtml = markedParser.parse(rawContent);
  parsedHtml = processCallouts(parsedHtml);

  // Navigation & Breadcrumbs
  const navHtml = buildNavHierarchy(allFiles, fileRel);
  const breadcrumbsHtml = buildBreadcrumbs(fileRel);

  // Relative path to root
  const depth = fileRel.split(path.sep).length - 1;
  const rootRel = depth === 0 ? './' : '../'.repeat(depth);

  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(pageTitle)} - Vimwiki</title>
  <link rel="stylesheet" href="${rootRel}assets/style.css">
</head>
<body data-root="${rootRel}">
  <script>(function(){if(localStorage.getItem('wiki-sidebar-collapsed')==='1'){document.body.classList.add('sidebar-collapsed');}var fs=localStorage.getItem('wiki-print-font-size');if(fs){document.documentElement.style.setProperty('--print-base-font-size',fs);}})();</script>
  <!-- Sidebar -->
  <aside id="sidebar">
    <div class="sidebar-header">
      <a href="${rootRel}index.html" class="sidebar-brand">
        <span class="logo-icon">${UI_ICONS.logo}</span>
        <span>Vimwiki</span>
      </a>
      <button id="sidebar-collapse-btn" class="sidebar-toggle-btn" title="Hide sidebar (⌘B)" aria-label="Hide sidebar">
        ${UI_ICONS.sidebarToggle}
      </button>
    </div>
    <button class="search-trigger" aria-label="Search notes">
      <span class="search-trigger-content">
        <span class="search-icon">${UI_ICONS.search}</span>
        <span>Search notes...</span>
      </span>
      <span class="kbd-shortcut">⌘K</span>
    </button>
    <nav class="sidebar-nav">
      ${navHtml}
    </nav>
  </aside>

  <!-- Main Content Area -->
  <div id="main-wrapper">
    <!-- Top Bar -->
    <header id="top-bar">
      <div class="top-bar-left">
        <button id="sidebar-expand-btn" class="sidebar-expand-btn" title="Show sidebar (⌘B)" aria-label="Show sidebar">
          ${UI_ICONS.sidebarToggle}
        </button>
        <button id="mobile-menu-btn" class="mobile-menu-btn" aria-label="Toggle menu">${UI_ICONS.menu}</button>
        <div class="breadcrumbs">
          ${breadcrumbsHtml}
        </div>
      </div>
      <div class="top-bar-actions">
        <button id="print-pdf-btn" class="btn-icon" title="Print or Export to PDF">
          ${UI_ICONS.pdf}
          <span class="btn-label">PDF</span>
        </button>
        <button id="theme-toggle-btn" class="btn-icon" title="Toggle Light/Dark Theme">
          ${UI_ICONS.moon}
          <span class="btn-label">Dark</span>
        </button>
      </div>
    </header>

    <!-- Page Content Container -->
    <div id="content-container">
      <main id="article-content">
        <!-- Print / PDF Control Bar -->
        <div class="print-toolbar" id="print-toolbar">
          <div class="print-toolbar-main">
            <div class="print-toolbar-group">
              <span class="print-toolbar-icon">${UI_ICONS.pdf}</span>
              <span class="print-toolbar-title">Print &amp; PDF</span>
            </div>
            <div class="print-toolbar-group">
              <label for="print-font-size-select" class="print-toolbar-label">Font Size:</label>
              <select id="print-font-size-select" class="print-select" aria-label="Print font size">
                <option value="9pt">Small (9pt)</option>
                <option value="10pt">Compact (10pt)</option>
                <option value="11pt" selected>Normal (11pt)</option>
                <option value="12pt">Medium (12pt)</option>
                <option value="13.5pt">Large (13.5pt)</option>
                <option value="15pt">Extra Large (15pt)</option>
              </select>
            </div>
            <div class="print-toolbar-group print-sections-manager">
              <button id="print-sections-toggle-btn" class="print-toolbar-btn" type="button" aria-expanded="false" title="Choose sections to print">
                <span id="print-sections-summary">Sections (All included)</span>
                <span class="dropdown-chevron">${UI_ICONS.chevron}</span>
              </button>
              <div id="print-sections-dropdown" class="print-sections-dropdown">
                <div class="print-dropdown-header">
                  <span>Sections to Print</span>
                  <div class="print-dropdown-actions">
                    <button type="button" id="print-select-all-btn" class="print-link-btn">All</button>
                    <span class="sep">|</span>
                    <button type="button" id="print-deselect-all-btn" class="print-link-btn">None</button>
                  </div>
                </div>
                <div id="print-sections-checklist" class="print-sections-checklist">
                </div>
              </div>
            </div>
            <div class="print-toolbar-group print-toolbar-actions">
              <button id="print-execute-btn" class="print-toolbar-btn print-primary-btn" type="button" title="Print document or save as PDF">
                ${UI_ICONS.pdf}
                <span>Print / Save PDF</span>
              </button>
            </div>
          </div>
        </div>
        ${parsedHtml}
      </main>
    </div>
  </div>

  <!-- Search Modal -->
  <div id="search-modal">
    <div class="search-dialog">
      <div class="search-input-wrapper">
        <span class="search-input-icon">${UI_ICONS.search}</span>
        <input type="text" id="search-input" placeholder="Search wiki notes (press Esc to exit)..." autocomplete="off">
      </div>
      <div id="search-results" class="search-results"></div>
      <div class="search-footer">
        <span>Use <kbd>↑</kbd> <kbd>↓</kbd> to navigate, <kbd>Enter</kbd> to select</span>
        <span><kbd>Esc</kbd> to close</span>
      </div>
    </div>
  </div>

  <script src="${rootRel}assets/app.js"></script>
</body>
</html>`;

  // Write out HTML file
  const destRel = fileRel.replace(/\.md$/, '.html');
  const destPath = path.join(DIST_DIR, destRel);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, fullHtml, 'utf-8');

  // Return search document entry
  const plainBody = rawContent
    .replace(/^#+.*$/gm, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[#*_`~>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    title: pageTitle,
    path: destRel,
    section: path.dirname(fileRel) === '.' ? 'Home' : path.dirname(fileRel),
    headings: toc.map(t => t.text),
    content: plainBody
  };
}

/**
 * Main build function
 */
function buildAll() {
  const startTime = Date.now();
  console.log('🚀 Starting Vimwiki static build...');

  // Auto-synchronize folder indexes so new notes are always included
  syncAllIndexes({ verbose: false });

  // Ensure directories
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.mkdirSync(ASSETS_DIST_DIR, { recursive: true });

  // Copy assets
  if (fs.existsSync(ASSETS_SRC_DIR)) {
    const assets = fs.readdirSync(ASSETS_SRC_DIR);
    for (const asset of assets) {
      fs.copyFileSync(path.join(ASSETS_SRC_DIR, asset), path.join(ASSETS_DIST_DIR, asset));
    }
  }

  const allFiles = getMarkdownFiles();
  const markedParser = createMarkedParser();
  const searchIndex = [];

  for (const fileRel of allFiles) {
    const searchDoc = compileFile(fileRel, allFiles, markedParser);
    searchIndex.push(searchDoc);
  }

  // Write search index
  fs.writeFileSync(
    path.join(ASSETS_DIST_DIR, 'search-index.json'),
    JSON.stringify(searchIndex, null, 2),
    'utf-8'
  );

  const duration = Date.now() - startTime;
  console.log(`✅ Compiled ${allFiles.length} wiki files into ${DIST_DIR} in ${duration}ms.`);
}

// Support building single file or all files
if (require.main === module) {
  const target = process.argv[2];
  if (target && target.endsWith('.md')) {
    const fileRel = path.isAbsolute(target) ? path.relative(ROOT_DIR, target) : target;
    const allFiles = getMarkdownFiles();
    const markedParser = createMarkedParser();
    compileFile(fileRel, allFiles, markedParser);
    console.log(`⚡ Compiled single file: ${fileRel}`);
  } else {
    buildAll();
  }
}

module.exports = { buildAll, compileFile, getMarkdownFiles };
