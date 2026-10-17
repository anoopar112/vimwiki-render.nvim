#!/usr/bin/env node
/**
 * Vimwiki PDF Generator
 * Compiles individual pages or the entire wiki into publication-quality vector PDFs using headless Chrome.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { buildAll, getMarkdownFiles, compileFile } = require('./build');
const { Marked } = require('marked');
const hljs = require('highlight.js');

const ROOT_DIR = process.env.VIMWIKI_DIR ? path.resolve(process.env.VIMWIKI_DIR) : path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');
const PDF_DIR = path.resolve(ROOT_DIR, 'pdf');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!fs.existsSync(CHROME_PATH)) {
  console.error(`❌ Google Chrome not found at ${CHROME_PATH}. Please install Google Chrome or update the path.`);
  process.exit(1);
}

// Ensure PDF output dir exists
fs.mkdirSync(PDF_DIR, { recursive: true });

/**
 * Print an HTML file to PDF using Chrome Headless
 */
function printHtmlToPdf(htmlPath, outputPath) {
  const fileUrl = 'file://' + path.resolve(htmlPath);
  const cmd = `"${CHROME_PATH}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${outputPath}" "${fileUrl}" 2>/dev/null`;
  try {
    execSync(cmd, { stdio: 'pipe' });
    const stats = fs.statSync(outputPath);
    console.log(`📄 Generated: ${path.relative(ROOT_DIR, outputPath)} (${Math.round(stats.size / 1024)} KB)`);
  } catch (err) {
    console.error(`❌ Failed to generate PDF for ${htmlPath}:`, err.message);
  }
}

/**
 * Generate a combined PDF book of the entire wiki
 */
function generateWikiBook() {
  console.log('📚 Assembling complete Vimwiki document for PDF export...');
  buildAll();

  const allFiles = getMarkdownFiles();
  const marked = new Marked({ gfm: true, breaks: false });

  let bookContent = '';
  let tocItems = [];

  // Group and sort files logically
  const priorityOrder = ['index.md', 'navigation.md', 'diary', 'personal', 'kbase', 'youtube', 'work', 'archive'];
  const sortedFiles = [...allFiles].sort((a, b) => {
    const aTop = a.split(path.sep)[0];
    const bTop = b.split(path.sep)[0];
    const aIdx = priorityOrder.indexOf(aTop);
    const bIdx = priorityOrder.indexOf(bTop);
    if (aIdx !== bIdx) {
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    }
    return a.localeCompare(b);
  });

  for (const fileRel of sortedFiles) {
    const fullPath = path.join(ROOT_DIR, fileRel);
    const rawContent = fs.readFileSync(fullPath, 'utf-8');

    // Title
    const h1Match = rawContent.match(/^#\s+(.*)$/m);
    const title = h1Match ? h1Match[1].trim() : fileRel.replace(/\.md$/, '');
    const pageId = 'doc-' + fileRel.replace(/[^\w-]/g, '-');

    tocItems.push({ title, id: pageId, path: fileRel });

    // Render markdown
    let html = marked.parse(rawContent);

    // Callout replacement
    html = html.replace(/<blockquote>([\s\S]*?)<\/blockquote>/gi, (fullMatch, inner) => {
      const headerMatch = inner.match(/^\s*<p>\s*\[!(NOTE|INFO|TIP|IMPORTANT|WARNING|CAUTION)\]([^\n<]*)(?:\n|<br\s*\/?>)?/i);
      if (!headerMatch) return fullMatch;
      const type = headerMatch[1].toUpperCase();
      const lowerType = type.toLowerCase();
      const inlineText = headerMatch[2].trim();
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
      return `<div class="callout callout-${lowerType}"><div class="callout-title">${displayTitle}</div><div class="callout-body">${body}</div></div>`;
    });

    bookContent += `
<section class="book-chapter" id="${pageId}">
  <div class="chapter-meta">${path.dirname(fileRel) === '.' ? 'General' : path.dirname(fileRel)}</div>
  ${html}
</section>
`;
  }

  const completeHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Vimwiki Complete Knowledge Base</title>
  <link rel="stylesheet" href="assets/style.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github.min.css">
  <style>
    body {
      background: #ffffff !important;
      color: #1e293b !important;
      display: block !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .book-cover {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      height: 90vh;
      text-align: center;
      page-break-after: always;
      break-after: page;
    }
    .book-cover h1 {
      font-size: 3.5rem;
      margin-bottom: 12px;
      border: none !important;
    }
    .book-cover .subtitle {
      font-size: 1.4rem;
      color: #64748b;
      margin-bottom: 32px;
    }
    .book-cover .date {
      font-size: 1rem;
      color: #94a3b8;
    }
    .book-toc {
      page-break-after: always;
      break-after: page;
      padding: 40px 0;
    }
    .book-toc h2 {
      font-size: 2rem;
      margin-bottom: 24px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 8px;
    }
    .book-toc-list {
      list-style: none;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .book-toc-list li {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px dotted #cbd5e1;
      padding-bottom: 4px;
    }
    .book-toc-list a {
      color: #2563eb;
      text-decoration: none;
    }
    .book-chapter {
      page-break-before: always;
      break-before: page;
      padding: 24px 0;
    }
    .chapter-meta {
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #94a3b8;
      margin-bottom: 8px;
    }
    @page {
      size: A4;
      margin: 20mm 15mm;
    }
  </style>
</head>
<body>
  <div class="book-cover">
    <div style="font-size: 5rem; margin-bottom: 20px;">📓</div>
    <h1>Vimwiki</h1>
    <div class="subtitle">Complete Knowledge Base & Notes</div>
    <div class="date">Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
  </div>

  <div class="book-toc">
    <h2>Table of Contents</h2>
    <ul class="book-toc-list">
      ${tocItems.map(item => `<li><a href="#${item.id}">${item.title}</a> <span style="color:#94a3b8; font-size:0.85rem;">${item.path}</span></li>`).join('\n      ')}
    </ul>
  </div>

  <div class="book-content">
    ${bookContent}
  </div>
</body>
</html>`;

  const bookHtmlPath = path.join(DIST_DIR, 'vimwiki_book.html');
  fs.writeFileSync(bookHtmlPath, completeHtml, 'utf-8');

  const outputPdfPath = path.join(PDF_DIR, 'vimwiki_complete.pdf');
  printHtmlToPdf(bookHtmlPath, outputPdfPath);
}

/**
 * Main PDF task dispatcher
 */
const arg = process.argv[2] || 'book';

if (arg === 'book') {
  generateWikiBook();
} else if (arg === 'all') {
  buildAll();
  const allFiles = getMarkdownFiles();
  console.log(`📄 Generating individual PDFs for ${allFiles.length} files...`);
  for (const fileRel of allFiles) {
    const htmlRel = fileRel.replace(/\.md$/, '.html');
    const htmlPath = path.join(DIST_DIR, htmlRel);
    const pdfRel = fileRel.replace(/\.md$/, '.pdf').replace(/\//g, '_');
    const pdfPath = path.join(PDF_DIR, pdfRel);
    printHtmlToPdf(htmlPath, pdfPath);
  }
} else {
  // Specific file
  const fileRel = arg.replace(/\.html$/, '.md');
  const htmlRel = fileRel.replace(/\.md$/, '.html');
  const htmlPath = path.join(DIST_DIR, htmlRel);
  if (!fs.existsSync(htmlPath)) {
    buildAll();
  }
  const pdfName = path.basename(fileRel, '.md') + '.pdf';
  const pdfPath = path.join(PDF_DIR, pdfName);
  printHtmlToPdf(htmlPath, pdfPath);
}
