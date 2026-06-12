/**
 * GraphQL Interceptor — MAIN world content script
 * Intercepts ALL /i/api/ requests and logs their URLs for debugging.
 * Filters for GraphQL patterns and dispatches to bridge.
 */
(function () {
  'use strict';

  const EVENT_NAME = '_' + Math.random().toString(36).slice(2);

  const beacon = document.createElement('meta');
  beacon.name = '__xtl_cfg';
  beacon.content = EVENT_NAME;
  (document.head || document.documentElement).appendChild(beacon);

  const xhrUrls = new WeakMap();
  const xhrPatched = new WeakSet();
  const seenEndpoints = new Set(); // Track all seen endpoints

  function extractEndpoint(url) {
    try {
      const path = new URL(url, location.origin).pathname;
      const parts = path.split('/').filter(Boolean);

      // Pattern 1: /i/api/graphql/<hash>/<EndpointName>
      const gqlIdx = parts.indexOf('graphql');
      if (gqlIdx >= 0 && parts[gqlIdx + 1]) {
        return parts[gqlIdx + 2] || parts[gqlIdx + 1] || 'GraphQL_Unknown';
      }

      // Pattern 2: /i/api/<version>/labs/<endpoint>
      // Pattern 3: /<version>/<endpoint> (e.g. /2/timeline/home)
      if (parts.length >= 3) {
        return parts.slice(0, 4).join('/');
      }

      return path;
    } catch {
      return 'Unknown';
    }
  }

  function isGraphQLUrl(url) {
    try {
      const path = new URL(url, location.origin).pathname;
      return path.includes('/i/api/graphql/') || path.includes('/i/api/graphql/');
    } catch {
      return false;
    }
  }

  function dispatchData(url, data) {
    const endpoint = extractEndpoint(url);

    // Log every new endpoint we see (once)
    if (!seenEndpoints.has(endpoint)) {
      seenEndpoints.add(endpoint);
      // Log to page console so user can see in DevTools too
      console.log(`[XTL:main] New endpoint: ${endpoint} → ${url.split('?')[0]}`);
    }

    // Only dispatch for GraphQL endpoints that contain tweet-like data
    if (isGraphQLUrl(url)) {
      document.dispatchEvent(new CustomEvent(EVENT_NAME, {
        detail: JSON.stringify({ url, endpoint, data })
      }));
    }
  }

  // --- Patch fetch ---
  const originalFetch = window.fetch;

  function makePatchedFetch(orig) {
    const patched = async function fetch(...args) {
      const response = await orig.apply(this, args);
      try {
        const url = (typeof args[0] === 'string') ? args[0] : args[0]?.url;
        if (url) {
          const path = new URL(url, location.origin).pathname;
          // Capture ALL /i/api/graphql/ requests
          if (path.includes('/i/api/graphql/')) {
            const clone = response.clone();
            clone.json().then(data => dispatchData(url, data)).catch(() => {});
          }
        }
      } catch (_) {}
      return response;
    };
    patched.toString = () => 'function fetch() { [native code] }';
    Object.defineProperty(patched, 'name', { value: 'fetch' });
    return patched;
  }

  window.fetch = makePatchedFetch(originalFetch);

  // --- Patch XMLHttpRequest ---
  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeOpenStr = nativeOpen.toString();

  function makePatchedOpen(origOpen) {
    const patched = function open(method, url, ...rest) {
      const urlStr = (typeof url === 'string') ? url : url?.toString();
      if (urlStr) {
        try {
          const path = new URL(urlStr, location.origin).pathname;
          if (path.includes('/i/api/graphql/')) {
            xhrUrls.set(this, urlStr);
            if (!xhrPatched.has(this)) {
              xhrPatched.add(this);
              this.addEventListener('load', function () {
                try {
                  const data = JSON.parse(this.responseText);
                  dispatchData(xhrUrls.get(this), data);
                } catch (_) {}
              });
            }
          }
        } catch (_) {}
      }
      return origOpen.call(this, method, url, ...rest);
    };
    patched.toString = () => nativeOpenStr;
    return patched;
  }

  XMLHttpRequest.prototype.open = makePatchedOpen(nativeOpen);

  // --- Re-patch on SPA navigation / override detection ---
  const myFetch = window.fetch;
  const myOpen = XMLHttpRequest.prototype.open;

  setInterval(() => {
    if (window.fetch !== myFetch) {
      window.fetch = makePatchedFetch(window.fetch);
    }
    if (XMLHttpRequest.prototype.open !== myOpen) {
      XMLHttpRequest.prototype.open = makePatchedOpen(XMLHttpRequest.prototype.open);
    }
  }, 3000);

  console.log('[XTL:main] GraphQL interceptor installed. Watching for /i/api/graphql/ requests.');
})();
