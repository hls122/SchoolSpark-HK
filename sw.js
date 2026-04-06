const STATIC_CACHE = 'hk-schools-static-v12';
const RUNTIME_CACHE = 'hk-schools-runtime-v12';
const CORE_ASSETS = [
	'./',
	'./index.html',
	'./compare.html',
	'./forum.html',
	'./manifest.json',
	'./SCH_LOC_EDB.json',
	'./forum-posts.json',
	'./api/schools',
	'./api/forum',
	'./sw.js'
];

self.addEventListener('install', event => {
	event.waitUntil(
		caches.open(STATIC_CACHE)
			.then(cache => cache.addAll(CORE_ASSETS))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', event => {
	event.waitUntil(
		caches.keys().then(cacheNames => Promise.all(
			cacheNames
				.filter(name => ![STATIC_CACHE, RUNTIME_CACHE].includes(name))
				.map(name => caches.delete(name))
		)).then(() => self.clients.claim())
	);
});

self.addEventListener('fetch', event => {
	const { request } = event;

	if (request.method !== 'GET') {
		return;
	}

	const url = new URL(request.url);
	const isNavigation = request.mode === 'navigate';
	const isSameOrigin = url.origin === self.location.origin;
	const isCdnAsset = /cdn\.jsdelivr\.net|unpkg\.com|tile\.openstreetmap\.org/.test(url.hostname);
	const isSchoolData = url.pathname.includes('SCH_LOC_EDB.json') || url.href.includes('SCH_LOC_EDB.json') || url.pathname.includes('/api/schools');

	if (isSchoolData) {
		event.respondWith(
			fetch(request)
				.then(response => {
					if (response && response.status === 200) {
						const copy = response.clone();
						caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
					}
					return response;
				})
				.catch(() => caches.match(request))
		);
		return;
	}

	if (isNavigation) {
		event.respondWith(
			fetch(request)
				.then(response => {
					const copy = response.clone();
					caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
					return response;
				})
				.catch(async () => {
					const cachedPage = await caches.match(request);
					return cachedPage || caches.match('./index.html');
				})
		);
		return;
	}

	if (isSameOrigin || isCdnAsset) {
		event.respondWith(
			caches.match(request).then(cached => {
				if (cached) {
					return cached;
				}

				return fetch(request).then(response => {
					if (!response || response.status !== 200) {
						return response;
					}

					const copy = response.clone();
					caches.open(RUNTIME_CACHE).then(cache => cache.put(request, copy));
					return response;
				});
			})
		);
	}
});