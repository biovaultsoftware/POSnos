// BalanceChain Service Worker
// Offline-first caching with proper asset management

const CACHE_VERSION = 'v2';
const CACHE_NAME = `sovereign-os-${CACHE_VERSION}`;

// Core assets to cache immediately
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/main.js',
  '/style.css',
  '/manifest.json'
];

// Optional assets to cache on-demand
const OPTIONAL_ASSETS = [
  '/icon-192.png',
  '/icon-512.png',
  '/offline.html'
];

// API routes that should bypass cache
const API_ROUTES = [
  '/api/',
  '/ws/',
  '/signal/'
];

// ============================================================================
// INSTALL EVENT
// ============================================================================

self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching core assets');
        // Cache core assets, but don't fail if some are missing
        return Promise.allSettled(
          CORE_ASSETS.map(url => 
            cache.add(url).catch(e => {
              console.warn(`[SW] Failed to cache ${url}:`, e.message);
            })
          )
        );
      })
      .then(() => {
        console.log('[SW] Installation complete');
        // Skip waiting to activate immediately
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Installation failed:', error);
      })
  );
});

// ============================================================================
// ACTIVATE EVENT
// ============================================================================

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('sovereign-os-') && name !== CACHE_NAME)
            .map((name) => {
              console.log(`[SW] Deleting old cache: ${name}`);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activation complete');
        // Take control of all clients immediately
        return self.clients.claim();
      })
  );
});

// ============================================================================
// FETCH EVENT
// ============================================================================

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip API routes (always fetch from network)
  if (API_ROUTES.some(route => url.pathname.startsWith(route))) {
    return;
  }
  
  // Skip cross-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }
  
  // Use cache-first strategy for most requests
  event.respondWith(
    cacheFirst(event.request)
  );
});

// ============================================================================
// CACHING STRATEGIES
// ============================================================================

/**
 * Cache-first strategy with network fallback
 * @param {Request} request 
 * @returns {Promise<Response>}
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  
  if (cached) {
    // Optionally update cache in background
    updateCache(request);
    return cached;
  }
  
  try {
    const response = await fetch(request);
    
    // Cache successful responses
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    
    return response;
    
  } catch (error) {
    // Return offline page if available
    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) {
      return offlinePage;
    }
    
    // Return basic offline response
    return new Response('Offline - Please reconnect', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/**
 * Network-first strategy with cache fallback
 * @param {Request} request 
 * @returns {Promise<Response>}
 */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    
    // Cache successful responses
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    
    return response;
    
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    
    throw error;
  }
}

/**
 * Update cache in background
 * @param {Request} request 
 */
async function updateCache(request) {
  try {
    const response = await fetch(request);
    
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response);
    }
  } catch (error) {
    // Silently fail - we already have cached version
  }
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'CLEAR_CACHE':
      clearCache().then(() => {
        event.ports[0]?.postMessage({ success: true });
      });
      break;
      
    case 'CACHE_URLS':
      cacheUrls(payload.urls).then(() => {
        event.ports[0]?.postMessage({ success: true });
      });
      break;
      
    case 'GET_CACHE_STATS':
      getCacheStats().then((stats) => {
        event.ports[0]?.postMessage(stats);
      });
      break;
      
    default:
      console.log('[SW] Unknown message type:', type);
  }
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Clear all caches
 * @returns {Promise<void>}
 */
async function clearCache() {
  const cacheNames = await caches.keys();
  await Promise.all(
    cacheNames.map(name => caches.delete(name))
  );
  console.log('[SW] All caches cleared');
}

/**
 * Cache specific URLs
 * @param {string[]} urls 
 * @returns {Promise<void>}
 */
async function cacheUrls(urls) {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(urls);
  console.log(`[SW] Cached ${urls.length} URLs`);
}

/**
 * Get cache statistics
 * @returns {Promise<Object>}
 */
async function getCacheStats() {
  const cacheNames = await caches.keys();
  const stats = {
    caches: cacheNames,
    currentCache: CACHE_NAME,
    entries: 0
  };
  
  for (const name of cacheNames) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    if (name === CACHE_NAME) {
      stats.entries = keys.length;
      stats.urls = keys.map(k => k.url);
    }
  }
  
  return stats;
}

// ============================================================================
// BACKGROUND SYNC (Future Enhancement)
// ============================================================================

self.addEventListener('sync', (event) => {
  console.log('[SW] Sync event:', event.tag);
  
  if (event.tag === 'sync-chain') {
    event.waitUntil(syncChain());
  }
});

/**
 * Sync chain data when back online
 * @returns {Promise<void>}
 */
async function syncChain() {
  // This would sync pending STAs when back online
  console.log('[SW] Chain sync triggered');
  
  // Notify clients
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_COMPLETE' });
  });
}

// ============================================================================
// PUSH NOTIFICATIONS (Future Enhancement)
// ============================================================================

self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  
  const options = {
    body: data.body || 'New notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'default',
    data: data
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'BalanceChain', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  event.waitUntil(
    self.clients.openWindow('/')
  );
});

console.log('[SW] Service Worker loaded');
