/**
 * GraphQL Interceptor — MAIN world content script
 * Patches fetch() and XMLHttpRequest to intercept X/Twitter GraphQL responses.
 *
 * Based on xTap (MIT License). Key stealth measures:
 * - toString() returns [native code]
 * - WeakMap for XHR tracking (no expando properties)
 * - Random event channel per page load
 * - Re-patches on SPA navigation
 */
(function () {
  'use strict';

  const GRAPHQL_PATTERN = '/i/api/graphql/';
  const EVENT_NAME = '_' + Math.random().toString(36).slice(2);

  // Communicate event name to ISOLATED world via <meta> tag
  const beacon = document.createElement('meta');
  beacon.name = '__xtl_cfg';
  beacon.content = EVENT_NAME;
  (document.head || document.documentElement).appendChild(beacon);

  const xhrUrls = new WeakMap();
  const xhrPatched = new WeakSet();

  function extractEndpoint(url) {
    try {
      const path = new URL(url, location.origin).pathname;
      const parts = path.split('/');
      const gqlIdx = parts.indexOf('graphql');
      return (gqlIdx >= 0 && parts[gqlIdx + 2]) ? parts[gqlIdx + 2] : 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  function dispatchData(url, data) {
    const endpoint = extractEndpoint(url);
    document.dispatchEvent(new CustomEvent(EVENT_NAME, {
      detail: JSON.stringify({ url, endpoint, data })
    }));
  }

  // --- Patch fetch ---
  const originalFetch = window.fetch;
  const patchedFetch = async function fetch(...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = (typeof args[0] === 'string') ? args[0] : args[0]?.url;
      if (url && url.includes(GRAPHQL_PATTERN)) {
        const clone = response.clone();
        clone.json().then(data => dispatchData(url, data)).catch(() => {});
      }
    } catch (_) {}
    return response;
  };
  patchedFetch.toString = () => 'function fetch() { [native code] }';
  Object.defineProperty(patchedFetch, 'name', { value: 'fetch' });
  window.fetch = patchedFetch;

  // --- Patch XMLHttpRequest ---
  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeOpenStr = nativeOpen.toString();

  const patchedOpen = function open(method, url, ...rest) {
    const urlStr = (typeof url === 'string') ? url : url?.toString();
    if (urlStr && urlStr.includes(GRAPHQL_PATTERN)) {
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
    return nativeOpen.call(this, method, url, ...rest);
  };
  patchedOpen.toString = () => nativeOpenStr;
  XMLHttpRequest.prototype.open = patchedOpen;

  // --- Re-patch check on SPA navigation ---
  // X.com is a SPA. If the page re-initializes and resets fetch/XHR,
  // we need to detect that and re-patch.
  let lastFetch = window.fetch;
  let lastOpen = XMLHttpRequest.prototype.open;

  setInterval(() => {
    // Re-patch fetch if it was overwritten
    if (window.fetch !== patchedFetch) {
      const savedOriginal = window.fetch;
      const repatchedFetch = async function fetch(...args) {
        const response = await savedOriginal.apply(this, args);
        try {
          const url = (typeof args[0] === 'string') ? args[0] : args[0]?.url;
          if (url && url.includes(GRAPHQL_PATTERN)) {
            const clone = response.clone();
            clone.json().then(data => dispatchData(url, data)).catch(() => {});
          }
        } catch (_) {}
        return response;
      };
      repatchedFetch.toString = () => 'function fetch() { [native code] }';
      Object.defineProperty(repatchedFetch, 'name', { value: 'fetch' });
      window.fetch = repatchedFetch;
    }

    // Re-patch XHR open if it was overwritten
    if (XMLHttpRequest.prototype.open !== patchedOpen) {
      const savedOpen = XMLHttpRequest.prototype.open;
      const savedOpenStr = savedOpen.toString();
      const repatchedOpen = function open(method, url, ...rest) {
        const urlStr = (typeof url === 'string') ? url : url?.toString();
        if (urlStr && urlStr.includes(GRAPHQL_PATTERN)) {
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
        return savedOpen.call(this, method, url, ...rest);
      };
      repatchedOpen.toString = () => savedOpenStr;
      XMLHttpRequest.prototype.open = repatchedOpen;
    }
  }, 5000);
})();
