/**
 * GraphQL Interceptor — MAIN world content script
 * Patches fetch() and XMLHttpRequest to intercept X/Twitter GraphQL responses.
 * Based on xTap's approach (MIT License).
 *
 * Zero additional network requests. Reads only what X already sends.
 * toString() returns [native code] to pass integrity checks.
 * WeakMap for XHR tracking (no expando properties).
 * Random event channel name per page load.
 */
(function () {
  'use strict';

  const GRAPHQL_PATTERN = '/i/api/graphql/';

  // Random event channel — unique per page load, unpredictable by page scripts
  const EVENT_NAME = '_' + Math.random().toString(36).slice(2);

  // Communicate event name to ISOLATED world via <meta> tag (removed after read)
  const beacon = document.createElement('meta');
  beacon.name = '__xtl_cfg';
  beacon.content = EVENT_NAME;
  (document.head || document.documentElement).appendChild(beacon);

  // WeakMap for XHR URL tracking (no expando properties on XHR instances)
  const xhrUrls = new WeakMap();
  const xhrPatched = new WeakSet();

  /**
   * Extract GraphQL endpoint name from URL
   * e.g. /i/api/graphql/abc123/HomeTimeline → HomeTimeline
   */
  function extractEndpoint(url) {
    try {
      const path = new URL(url, location.origin).pathname;
      const parts = path.split('/');
      const gqlIdx = parts.indexOf('graphql');
      // Endpoint name is after the hash: /i/api/graphql/<hash>/<EndpointName>
      return (gqlIdx >= 0 && parts[gqlIdx + 2]) ? parts[gqlIdx + 2] : 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Dispatch intercepted data to ISOLATED world bridge
   */
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
        // Clone to avoid consuming the body (X's code still needs the original)
        const clone = response.clone();
        clone.json().then(data => dispatchData(url, data)).catch(() => {});
      }
    } catch (_) {}
    return response;
  };
  // Pass toString() integrity checks
  patchedFetch.toString = () => 'function fetch() { [native code] }';
  Object.defineProperty(patchedFetch, 'name', { value: 'fetch' });
  window.fetch = patchedFetch;

  // --- Patch XMLHttpRequest ---
  // Only patch open() to attach a load listener for GraphQL URLs.
  // send() is NOT patched — non-GraphQL XHR calls have a clean stack trace.
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
})();
