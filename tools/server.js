#!/usr/bin/env node
/**
 * Vimwiki Live Development Server & Auto-Compiler
 * High-performance, low-latency static server with SSE live-reload and file watcher.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { buildAll, getMarkdownFiles } = require('./build');
const { syncAllIndexes } = require('./index-sync');

const ROOT_DIR = process.env.VIMWIKI_DIR ? path.resolve(process.env.VIMWIKI_DIR) : path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');
const DEFAULT_PORT = 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.md': 'text/plain; charset=utf-8'
};

// Active SSE client connections
const sseClients = new Set();

/**
 * Broadcast reload event to all connected browsers
 */
function broadcastReload() {
  for (const client of sseClients) {
    try {
      client.write('data: reload\n\n');
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// Keep-alive heartbeat every 15 seconds to prune dead connections
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': ping\n\n');
    } catch (e) {
      sseClients.delete(client);
    }
  }
}, 15000);

/**
 * Create HTTP server
 */
function createServer(port = DEFAULT_PORT) {
  const server = http.createServer((req, res) => {
    // SSE Endpoint for Live-Reload
    if (req.url === '/__livereload') {
      req.socket.setKeepAlive(true, 10000);
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(': connected\n\n');
      sseClients.add(res);

      const cleanup = () => {
        sseClients.delete(res);
      };
      req.on('close', cleanup);
      req.on('error', cleanup);
      res.on('close', cleanup);
      res.on('error', cleanup);
      return;
    }

    // Parse requested path
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/' || reqPath.endsWith('/')) {
      reqPath += 'index.html';
    } else if (!path.extname(reqPath)) {
      if (fs.existsSync(path.join(DIST_DIR, reqPath + '.html'))) {
        reqPath += '.html';
      } else if (fs.existsSync(path.join(DIST_DIR, reqPath, 'index.html'))) {
        reqPath += '/index.html';
      }
    }

    let filePath = path.join(DIST_DIR, reqPath);

    // Prevent directory traversal
    if (!filePath.startsWith(DIST_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
<!DOCTYPE html>
<html>
<head><title>404 Not Found</title><link rel="stylesheet" href="/assets/style.css"></head>
<body style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;">
  <h1>404 - Page Not Found</h1>
  <p>The requested page could not be found.</p>
  <a href="/" class="btn-icon" style="padding:10px 18px;">Return to Home</a>
</body>
</html>`);
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      // Fast in-memory serving with precise Content-Length
      fs.readFile(filePath, (readErr, data) => {
        if (readErr) {
          res.writeHead(500);
          res.end('Read error');
          return;
        }

        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': Buffer.byteLength(data),
          'Cache-Control': 'no-cache, must-revalidate',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(data);
      });
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} in use, trying ${port + 1}...`);
      createServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`\n======================================================`);
    console.log(` 🚀 Vimwiki Browsable Site is Live!`);
    console.log(` 🌐 URL: ${url}`);
    console.log(` ⚡ Ultra-fast instant SPA navigation & live-reloading`);
    console.log(`======================================================\n`);

    if (process.argv.includes('--open')) {
      const plat = process.platform;
      if (plat === 'darwin') {
        exec(`open "${url}"`);
      } else if (plat === 'win32') {
        exec(`start "" "${url}"`);
      } else {
        exec(`xdg-open "${url}"`);
      }
    }

    startWatcher();
  });
}

/**
 * Watcher for automatic compilation
 */
let debounceTimer = null;
const IGNORED_PATHS = ['/dist', '/pdf', '/node_modules', '/.git', '/.gemini', '/scratch'];

function startWatcher() {
  console.log(`👀 Watching for wiki changes in ${ROOT_DIR}...`);

  fs.watch(ROOT_DIR, { recursive: true }, (eventType, filename) => {
    if (!filename) return;

    const normalized = '/' + filename.replace(/\\/g, '/');
    for (const ignored of IGNORED_PATHS) {
      if (normalized.startsWith(ignored + '/') || normalized === ignored) {
        return;
      }
    }

    const isMd = filename.endsWith('.md');
    const isAsset = filename.startsWith('tools/assets/') || filename.startsWith('tools\\assets\\');

    if (!isMd && !isAsset) return;

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const timestamp = new Date().toLocaleTimeString();
      try {
        console.log(`[${timestamp}] 📝 Detected change in ${filename}, checking indexes & compiling...`);
        const syncResults = syncAllIndexes({ verbose: false });
        if (syncResults.added.length > 0 || syncResults.created.length > 0) {
          const total = syncResults.added.length + syncResults.created.length;
          console.log(`[${timestamp}] 📌 Auto-indexed ${total} new file(s) into folder index!`);
        }
        buildAll();
        broadcastReload();
        console.log(`[${timestamp}] ✨ Rebuilt & browser updated!`);
      } catch (err) {
        console.error(`[${timestamp}] ❌ Build error:`, err.message);
      }
    }, 60);
  });
}

// Initial index sync & build on server launch
syncAllIndexes({ verbose: false });
buildAll();
createServer(DEFAULT_PORT);
