/* ==========================================================================
   Vimwiki Browsable Web & PDF Client Application
   Instant SPA Navigation (PJAX), Search, Theme Toggle, TOC Spy, Live Reload
   ========================================================================== */

(function() {
  'use strict';

  // --- 1. Theme Management ---
  function initTheme() {
    const savedTheme = localStorage.getItem('wiki-theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('wiki-theme', next);
    updateThemeIcon(next);
  }

  function updateThemeIcon(theme) {
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      const sunSvg = '<svg class="btn-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
      const moonSvg = '<svg class="btn-svg-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
      btn.innerHTML = theme === 'dark' ? `${sunSvg} <span class="btn-label">Light</span>` : `${moonSvg} <span class="btn-label">Dark</span>`;
    }
  }

  // --- 2. Sidebar Collapsible Sections ---
  function initSidebar() {
    const headers = document.querySelectorAll('.nav-section-title');
    headers.forEach(header => {
      header.onclick = (e) => {
        e.stopPropagation();
        const section = header.parentElement;
        const sectionId = section.getAttribute('data-section');
        section.classList.toggle('collapsed');
        if (sectionId) {
          localStorage.setItem('wiki-section-' + sectionId, section.classList.contains('collapsed') ? '1' : '0');
        }
      };
    });

    // Restore saved section state
    document.querySelectorAll('.nav-section').forEach(section => {
      const sectionId = section.getAttribute('data-section');
      if (sectionId && localStorage.getItem('wiki-section-' + sectionId) === '1') {
        if (!section.querySelector('.nav-link.active')) {
          section.classList.add('collapsed');
        }
      }
    });

    // Mobile menu toggle
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    if (mobileBtn && sidebar) {
      mobileBtn.onclick = (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('open');
      };
      document.addEventListener('click', (e) => {
        if (!sidebar.contains(e.target) && !mobileBtn.contains(e.target)) {
          sidebar.classList.remove('open');
        }
      });
    }
  }

  // --- 3. On-Page Table of Contents (Scroll Spy) ---
  let removeTocScrollListener = null;

  function initTocSpy() {
    if (removeTocScrollListener) {
      removeTocScrollListener();
      removeTocScrollListener = null;
    }

    const headings = document.querySelectorAll('#article-content h2, #article-content h3');
    const tocLinks = document.querySelectorAll('.toc-item');
    if (!headings.length || !tocLinks.length) return;

    function updateActiveHeading() {
      let activeId = null;
      const scrollPos = window.scrollY + 100;

      for (let i = headings.length - 1; i >= 0; i--) {
        const h = headings[i];
        if (h.offsetTop <= scrollPos) {
          activeId = h.id;
          break;
        }
      }

      tocLinks.forEach(item => {
        const link = item.querySelector('a');
        if (link && link.getAttribute('href') === '#' + activeId) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    }

    window.addEventListener('scroll', updateActiveHeading, { passive: true });
    removeTocScrollListener = () => window.removeEventListener('scroll', updateActiveHeading);
    updateActiveHeading();
  }

  // --- 4. Code Block Copy Button ---
  window.copyCode = function(button) {
    const block = button.closest('.code-block');
    if (!block) return;
    const code = block.querySelector('pre code');
    if (!code) return;

    navigator.clipboard.writeText(code.innerText).then(() => {
      const originalText = button.innerText;
      button.innerText = 'Copied!';
      button.classList.add('copied');
      setTimeout(() => {
        button.innerText = originalText;
        button.classList.remove('copied');
      }, 2000);
    }).catch(err => {
      console.error('Copy failed', err);
    });
  };

  // --- 5. Robust Instant SPA Navigation (PJAX) ---
  // In-memory page cache indexed by canonical absolute pathnames (/personal/german/notes_de.html)
  const pageCache = new Map();

  async function fetchPage(pathname) {
    let key = pathname;
    if (key === '/' || key.endsWith('/')) {
      key += 'index.html';
    }

    if (pageCache.has(key)) {
      return pageCache.get(key);
    }

    const res = await fetch(key);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${key}`);
    const html = await res.text();
    pageCache.set(key, html);
    return html;
  }

  function prefetchPage(pathname) {
    let key = pathname;
    if (key === '/' || key.endsWith('/')) {
      key += 'index.html';
    }
    if (!pageCache.has(key)) {
      fetch(key)
        .then(res => res.text())
        .then(html => pageCache.set(key, html))
        .catch(() => {});
    }
  }

  async function navigateTo(targetUrl, pushState = true, options = {}) {
    const { preserveScroll = false, restorePosition = null } = options;
    const savedScrollX = window.scrollX || document.documentElement.scrollLeft || 0;
    const savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;

    try {
      const url = new URL(targetUrl, window.location.href);
      const pathname = url.pathname;
      const hash = url.hash;

      const curToc = document.querySelector('#toc-container');
      const savedTocScroll = curToc ? curToc.scrollTop : 0;

      // 1. Fetch page using canonical pathname
      const htmlText = await fetchPage(pathname);
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');

      // 2. Update Document Title
      document.title = doc.title;

      // 3. Update Breadcrumbs
      const newBreadcrumbs = doc.querySelector('.breadcrumbs');
      const curBreadcrumbs = document.querySelector('.breadcrumbs');
      if (newBreadcrumbs && curBreadcrumbs) {
        curBreadcrumbs.innerHTML = newBreadcrumbs.innerHTML;
      }

      // 4. Update Article Content
      const newArticle = doc.querySelector('#article-content');
      const curArticle = document.querySelector('#article-content');
      if (newArticle && curArticle) {
        curArticle.innerHTML = newArticle.innerHTML;
      }

      // 5. Update Table of Contents
      const newToc = doc.querySelector('#toc-container');
      if (curToc) {
        if (newToc) {
          curToc.innerHTML = newToc.innerHTML;
          curToc.style.display = '';
          if (preserveScroll) {
            curToc.scrollTop = savedTocScroll;
          }
        } else {
          curToc.innerHTML = '';
          curToc.style.display = 'none';
        }
      }

      // 6. Update Sidebar Nav (Preserve sidebar scroll position)
      const sidebar = document.getElementById('sidebar');
      const curNav = document.querySelector('.sidebar-nav');
      const newNav = doc.querySelector('.sidebar-nav');
      if (curNav && newNav) {
        const savedScroll = sidebar ? sidebar.scrollTop : 0;
        curNav.innerHTML = newNav.innerHTML;
        if (sidebar) sidebar.scrollTop = savedScroll;
        initSidebar();
      }

      // 7. Update Active Link in Sidebar & Expand active section
      updateSidebarActive(pathname);

      // 8. Update History State (Always push clean canonical URL)
      if (pushState) {
        try {
          history.replaceState({
            pathname: window.location.pathname,
            scrollX: savedScrollX,
            scrollY: savedScrollY
          }, '');
          history.pushState({
            pathname,
            scrollX: 0,
            scrollY: 0
          }, '', url.pathname + url.search + url.hash);
        } catch (e) {
          history.pushState({ pathname }, '', url.pathname + url.search + url.hash);
        }
      }

      // 9. Scroll behavior
      if (preserveScroll) {
        const restoreScroll = () => {
          try {
            window.scrollTo({ left: savedScrollX, top: savedScrollY, behavior: 'instant' });
          } catch (e) {
            window.scrollTo(savedScrollX, savedScrollY);
          }
          window.dispatchEvent(new Event('scroll'));
        };
        restoreScroll();
        requestAnimationFrame(restoreScroll);
        setTimeout(restoreScroll, 30);
        setTimeout(restoreScroll, 100);
      } else if (restorePosition && typeof restorePosition.y === 'number') {
        const restoreSaved = () => {
          try {
            window.scrollTo({ left: restorePosition.x || 0, top: restorePosition.y, behavior: 'instant' });
          } catch (e) {
            window.scrollTo(restorePosition.x || 0, restorePosition.y);
          }
          window.dispatchEvent(new Event('scroll'));
        };
        restoreSaved();
        requestAnimationFrame(restoreSaved);
        setTimeout(restoreSaved, 30);
      } else if (hash) {
        const id = decodeURIComponent(hash.slice(1));
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
        else {
          try {
            window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
          } catch (e) {
            window.scrollTo(0, 0);
          }
        }
      } else {
        try {
          window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
        } catch (e) {
          window.scrollTo(0, 0);
        }
      }

      // 10. Re-initialize TOC Spy
      initTocSpy();

      // Close mobile drawer if open
      if (sidebar) sidebar.classList.remove('open');

    } catch (err) {
      console.warn('SPA navigation error, falling back to full browser load:', err);
      if (preserveScroll) {
        try {
          sessionStorage.setItem('wiki_scroll_' + window.location.pathname, JSON.stringify({
            x: savedScrollX,
            y: savedScrollY
          }));
        } catch (e) {}
      }
      window.location.href = targetUrl;
    }
  }

  function updateSidebarActive(pathname) {
    let normalized = pathname.replace(/\/index\.html$/, '').replace(/\.html$/, '');
    if (!normalized) normalized = '/';

    document.querySelectorAll('.sidebar-nav .nav-link').forEach(link => {
      try {
        const linkUrl = new URL(link.href, window.location.href);
        let linkPath = linkUrl.pathname.replace(/\/index\.html$/, '').replace(/\.html$/, '');
        if (!linkPath) linkPath = '/';

        if (linkPath === normalized) {
          link.classList.add('active');
          let parent = link.closest('.nav-section');
          while (parent) {
            parent.classList.remove('collapsed');
            parent = parent.parentElement ? parent.parentElement.closest('.nav-section') : null;
          }
        } else {
          link.classList.remove('active');
        }
      } catch (e) {}
    });
  }

  function initPjax() {
    // Intercept clicks on links
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link) return;

      // Ignore modifier clicks
      if (link.target === '_blank' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const rawHref = link.getAttribute('href');
      if (!rawHref) return;

      // Ignore external protocols
      if (rawHref.startsWith('mailto:') || rawHref.startsWith('tel:') || rawHref.startsWith('javascript:')) return;

      // Parse target URL using browser's resolved link.href
      let targetUrl;
      try {
        targetUrl = new URL(link.href, window.location.href);
      } catch (err) {
        return;
      }

      // Only handle same-origin URLs
      if (targetUrl.origin !== window.location.origin) return;

      // If it's a hash jump on the EXACT SAME page:
      if (targetUrl.pathname === window.location.pathname && targetUrl.search === window.location.search && targetUrl.hash) {
        e.preventDefault();
        const id = decodeURIComponent(targetUrl.hash.slice(1));
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
          history.pushState(null, '', targetUrl.hash);
        }
        return;
      }

      // Only handle .html pages or root /
      if (!targetUrl.pathname.endsWith('.html') && targetUrl.pathname !== '/' && !targetUrl.pathname.endsWith('/')) {
        return; // Allow direct downloads for other extensions (.pdf, etc.)
      }

      e.preventDefault();
      navigateTo(targetUrl.href, true);
    });

    // Hover prefetching for instantaneous clicks (<1ms)
    document.addEventListener('mouseover', (e) => {
      const link = e.target.closest('a');
      if (!link) return;
      try {
        const url = new URL(link.href, window.location.href);
        if (url.origin === window.location.origin) {
          prefetchPage(url.pathname);
        }
      } catch (err) {}
    }, { passive: true });

    // Handle Browser Back / Forward buttons perfectly
    window.addEventListener('popstate', (e) => {
      const state = e.state;
      if (state && typeof state.scrollY === 'number') {
        navigateTo(window.location.href, false, {
          restorePosition: { x: state.scrollX, y: state.scrollY }
        });
      } else {
        navigateTo(window.location.href, false);
      }
    });
  }

  // --- 6. Instant Full-Text Search ---
  let searchIndex = null;

  async function loadSearchIndex() {
    if (searchIndex) return searchIndex;
    try {
      const res = await fetch('/assets/search-index.json');
      if (res.ok) {
        searchIndex = await res.json();
      }
    } catch (e) {
      console.warn('Search index not available', e);
    }
    return searchIndex;
  }

  function initSearch() {
    const modal = document.getElementById('search-modal');
    const input = document.getElementById('search-input');
    const resultsContainer = document.getElementById('search-results');
    const triggers = document.querySelectorAll('.search-trigger');
    let selectedIndex = -1;

    function openSearch() {
      if (!modal) return;
      modal.classList.add('active');
      loadSearchIndex();
      if (input) {
        input.value = '';
        input.focus();
        renderResults([]);
      }
    }

    function closeSearch() {
      if (!modal) return;
      modal.classList.remove('active');
      selectedIndex = -1;
    }

    triggers.forEach(t => t.addEventListener('click', openSearch));

    // Keyboard shortcut (Cmd+K or Ctrl+K or '/')
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (modal && modal.classList.contains('active')) closeSearch();
        else openSearch();
      } else if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        e.preventDefault();
        openSearch();
      } else if (e.key === 'Escape' && modal && modal.classList.contains('active')) {
        closeSearch();
      }
    });

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeSearch();
      });
    }

    function renderResults(results) {
      if (!resultsContainer) return;
      if (!results.length) {
        resultsContainer.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted);">Type keywords to search across all notes...</div>';
        return;
      }

      resultsContainer.innerHTML = results.map((item, idx) => `
        <a href="/${item.path.replace(/^\//, '')}" class="search-result-item ${idx === selectedIndex ? 'selected' : ''}" data-idx="${idx}">
          <div class="search-result-header">
            <span class="search-result-title">${item.highlightedTitle || item.title}</span>
            <span class="search-result-section">${item.section || 'General'}</span>
          </div>
          ${item.snippet ? `<div class="search-result-snippet">${item.snippet}</div>` : ''}
        </a>
      `).join('');

      // Attach instant navigation to search result links
      resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          closeSearch();
          navigateTo(item.getAttribute('href'), true);
        });
      });
    }

    function performSearch(query) {
      if (!searchIndex) return;
      const q = query.trim().toLowerCase();
      if (!q) {
        renderResults([]);
        return;
      }

      const terms = q.split(/\s+/).filter(Boolean);
      const scored = [];

      for (const entry of searchIndex) {
        let score = 0;
        const titleLower = entry.title.toLowerCase();
        const contentLower = entry.content.toLowerCase();
        const headingsLower = (entry.headings || []).join(' ').toLowerCase();

        let allMatched = true;
        for (const term of terms) {
          if (titleLower.includes(term)) score += 10;
          else if (headingsLower.includes(term)) score += 5;
          else if (contentLower.includes(term)) score += 1;
          else {
            allMatched = false;
            break;
          }
        }

        if (allMatched && score > 0) {
          let snippet = '';
          const matchIdx = contentLower.indexOf(terms[0]);
          if (matchIdx !== -1) {
            const start = Math.max(0, matchIdx - 40);
            const end = Math.min(entry.content.length, matchIdx + 120);
            snippet = (start > 0 ? '...' : '') + entry.content.substring(start, end) + (end < entry.content.length ? '...' : '');
            for (const term of terms) {
              const reg = new RegExp(`(${term})`, 'gi');
              snippet = snippet.replace(reg, '<mark>$1</mark>');
            }
          }
          scored.push({ ...entry, score, snippet });
        }
      }

      scored.sort((a, b) => b.score - a.score);
      const topResults = scored.slice(0, 12);
      selectedIndex = topResults.length > 0 ? 0 : -1;
      renderResults(topResults);
    }

    if (input) {
      input.addEventListener('input', (e) => performSearch(e.target.value));
      input.addEventListener('keydown', (e) => {
        const items = resultsContainer.querySelectorAll('.search-result-item');
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedIndex = (selectedIndex + 1) % items.length;
          updateSelected(items);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedIndex = (selectedIndex - 1 + items.length) % items.length;
          updateSelected(items);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (selectedIndex >= 0 && items[selectedIndex]) {
            items[selectedIndex].click();
          }
        }
      });
    }

    function updateSelected(items) {
      items.forEach((it, i) => {
        if (i === selectedIndex) {
          it.classList.add('selected');
          it.scrollIntoView({ block: 'nearest' });
        } else {
          it.classList.remove('selected');
        }
      });
    }
  }

  // --- 7. Live Reload via Single Server-Sent Events Connection ---
  let evtSource = null;

  function initLiveReload() {
    if (window.location.protocol.startsWith('http')) {
      try {
        if (evtSource) {
          evtSource.close();
        }

        evtSource = new EventSource('/__livereload');

        evtSource.onmessage = function(e) {
          if (e.data === 'reload') {
            console.log('[wiki] Change detected, reloading page content...');
            pageCache.clear();
            navigateTo(window.location.href, false, { preserveScroll: true });
          }
        };

        window.addEventListener('beforeunload', () => {
          if (evtSource) evtSource.close();
        });
        window.addEventListener('pagehide', () => {
          if (evtSource) evtSource.close();
        });
      } catch (err) {
        // SSE not supported or offline
      }
    }
  }

  // --- 8. Scroll Restoration Management ---
  function initScrollRestoration() {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    window.addEventListener('beforeunload', () => {
      try {
        sessionStorage.setItem('wiki_scroll_' + window.location.pathname, JSON.stringify({
          x: window.scrollX || document.documentElement.scrollLeft || 0,
          y: window.scrollY || document.documentElement.scrollTop || 0
        }));
      } catch (e) {}
    });

    try {
      const savedKey = 'wiki_scroll_' + window.location.pathname;
      const savedJson = sessionStorage.getItem(savedKey);
      if (savedJson) {
        sessionStorage.removeItem(savedKey);
        const pos = JSON.parse(savedJson);
        if (pos && typeof pos.y === 'number' && pos.y > 0) {
          const restore = () => {
            try {
              window.scrollTo({ left: pos.x || 0, top: pos.y, behavior: 'instant' });
            } catch (e) {
              window.scrollTo(pos.x || 0, pos.y);
            }
          };
          restore();
          requestAnimationFrame(restore);
          setTimeout(restore, 30);
          setTimeout(restore, 100);
        }
      }
    } catch (e) {}
  }

  // --- 9. Initialization ---
  document.addEventListener('DOMContentLoaded', () => {
    initScrollRestoration();
    initTheme();
    initSidebar();
    initTocSpy();
    initPjax();
    initSearch();
    initLiveReload();

    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    const printBtn = document.getElementById('print-pdf-btn');
    if (printBtn) printBtn.addEventListener('click', () => window.print());
  });
})();
