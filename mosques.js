// Nearby Mosques app
// - Leaflet map centered on user (Geolocation)
// - Bottom drawer with search + list (sorted by distance)
// - Save/unsave mosques in localStorage
// - Directions button opens Google Maps

(function () {
  const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
  const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
  const RADIUS_METERS = 5000; // search radius

  // State
  let map;
  let markersLayer;
  let userLatLng = null;
  let centerLatLng = null; // current search/map center
  let saved = loadSaved(); // Set of ids like "node/123"

  // Elements
  const drawer = document.getElementById('drawer');
  const drawerToggle = document.getElementById('drawerToggle');
  const statusEl = document.getElementById('status');
  const listEl = document.getElementById('list');
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const recenterBtn = document.getElementById('recenterBtn');

  // Init
  initMap();
  wireUI();
  geolocate();

  function initMap() {
    map = L.map('map');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
    map.setView([0, 0], 2);
  }

  function wireUI() {
    // Drawer toggle
    drawerToggle.addEventListener('click', () => {
      drawer.classList.toggle('open');
      drawerToggle.textContent = drawer.classList.contains('open') ? '▼' : '▲';
    });

    // Search
    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        doSearch();
      }
    });

    // Recenter
    recenterBtn.addEventListener('click', () => {
      if (!userLatLng) return;
      map.setView([userLatLng.lat, userLatLng.lng], 15);
      centerLatLng = { ...userLatLng };
      refresh(centerLatLng);
    });

    // List interactions (save/unsave, focus marker)
    listEl.addEventListener('click', (e) => {
      const target = e.target;
      const itemEl = target.closest('.item');
      if (!itemEl) return;

      const id = itemEl.getAttribute('data-id');
      const lat = parseFloat(itemEl.getAttribute('data-lat'));
      const lon = parseFloat(itemEl.getAttribute('data-lon'));

      if (target.classList.contains('save-btn')) {
        toggleSave(id);
        renderList(currentItemsCache, centerLatLng); // update hearts
        return;
      }

      if (target.classList.contains('focus-btn')) {
        map.setView([lat, lon], 16);
        return;
      }
    });
  }

  function geolocate() {
    if (!navigator.geolocation) {
      status('Geolocation not supported');
      return;
    }
    status('Locating…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLatLng = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        centerLatLng = { ...userLatLng };
        map.setView([userLatLng.lat, userLatLng.lng], 15);
        L.marker([userLatLng.lat, userLatLng.lng], { title: 'You' }).addTo(map);
        refresh(centerLatLng);
      },
      (err) => {
        console.warn('Geolocation failed:', err);
        status('Location unavailable. Search a place.');
        map.setView([20, 0], 2);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function doSearch() {
    const q = searchInput.value.trim();
    if (!q) return;
    status('Searching…');
    const url = `${NOMINATIM_URL}?q=${encodeURIComponent(q)}&format=json&limit=1`;
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then((r) => r.json())
      .then((arr) => {
        if (!arr || !arr.length) {
          status('No results');
          return;
        }
        const res = arr[0];
        const lat = parseFloat(res.lat);
        const lon = parseFloat(res.lon);
        centerLatLng = { lat, lng: lon };
        map.setView([lat, lon], 14);
        refresh(centerLatLng);
      })
      .catch((e) => {
        console.error(e);
        status('Search failed');
      });
  }

  let currentItemsCache = [];
  function refresh(center) {
    if (!center) return;
    status('Loading nearby…');
    fetchOverpass(center, RADIUS_METERS)
      .then((items) => {
        currentItemsCache = items;
        renderMarkers(items);
        renderList(items, center);
        status(`${items.length} nearby within ${(RADIUS_METERS / 1000).toFixed(0)} km`);
      })
      .catch((e) => {
        console.error(e);
        status('Failed to load nearby');
      });
  }

  function fetchOverpass(center, radius) {
    const query = `
      [out:json][timeout:25];
      (
        node["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${center.lat},${center.lng});
        way["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${center.lat},${center.lng});
        relation["amenity"="place_of_worship"]["religion"="muslim"](around:${radius},${center.lat},${center.lng});
      );
      out center tags;`;

    return fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
    })
      .then((r) => r.json())
      .then((data) => {
        const elems = Array.isArray(data.elements) ? data.elements : [];
        const list = [];
        for (const el of elems) {
          const norm = normalizeElement(el);
          if (!norm) continue;
          norm.distance = distanceMeters(center.lat, center.lng, norm.lat, norm.lon);
          list.push(norm);
        }
        list.sort((a, b) => a.distance - b.distance);
        return list;
      });
  }

  function normalizeElement(el) {
    const type = el.type; // node | way | relation
    const id = `${type}/${el.id}`;
    const name = (el.tags && (el.tags.name || el.tags['name:en'])) || 'Unnamed Mosque';
    const lat = type === 'node' ? el.lat : (el.center && el.center.lat);
    const lon = type === 'node' ? el.lon : (el.center && el.center.lon);
    if (lat == null || lon == null) return null;
    return { id, type, name, lat, lon, tags: el.tags || {} };
  }

  function renderMarkers(items) {
    markersLayer.clearLayers();
    for (const it of items) {
      const marker = L.marker([it.lat, it.lon], { title: it.name });
      marker.bindPopup(`${escapeHtml(it.name)}`);
      marker.addTo(markersLayer);
    }
  }

  function renderList(items, center) {
    listEl.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (const it of items) {
      const dist = formatDistance(it.distance || distanceMeters(center.lat, center.lng, it.lat, it.lon));
      const row = document.createElement('div');
      row.className = 'item';
      row.setAttribute('data-id', it.id);
      row.setAttribute('data-lat', it.lat);
      row.setAttribute('data-lon', it.lon);

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = it.name;

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = dist;

      const actions = document.createElement('div');
      actions.className = 'actions';

      const focusBtn = document.createElement('button');
      focusBtn.className = 'focus-btn';
      focusBtn.title = 'Show on map';
      focusBtn.setAttribute('aria-label', 'Show on map');
      focusBtn.textContent = '📍';

      const saveBtn = document.createElement('button');
      saveBtn.className = 'save-btn';
      saveBtn.title = saved.has(it.id) ? 'Unsave' : 'Save';
      saveBtn.setAttribute('aria-label', saveBtn.title);
      saveBtn.textContent = saved.has(it.id) ? '❤️' : '🤍';

      const dirA = document.createElement('a');
      dirA.className = 'dir-btn';
      dirA.href = googleMapsDirections(it.lat, it.lon);
      dirA.target = '_blank';
      dirA.rel = 'noopener';
      dirA.title = 'Directions';
      dirA.setAttribute('aria-label', 'Directions');
      dirA.textContent = '➡️';

      actions.appendChild(focusBtn);
      actions.appendChild(saveBtn);
      actions.appendChild(dirA);

      row.appendChild(name);
      row.appendChild(meta);
      row.appendChild(actions);

      frag.appendChild(row);
    }
    listEl.appendChild(frag);
  }

  function toggleSave(id) {
    if (saved.has(id)) saved.delete(id); else saved.add(id);
    persistSaved(saved);
  }

  function loadSaved() {
    try {
      const raw = localStorage.getItem('savedMosques');
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  }

  function persistSaved(set) {
    try {
      localStorage.setItem('savedMosques', JSON.stringify(Array.from(set)));
    } catch {}
  }

  function googleMapsDirections(lat, lon) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
  }

  function distanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // meters
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const dPhi = toRad(lat2 - lat1);
    const dLam = toRad(lon2 - lon1);
    const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function toRad(d) { return d * Math.PI / 180; }

  function formatDistance(m) {
    if (m < 1000) return `${Math.round(m)} m`;
    const km = m / 1000;
    return `${km.toFixed(km < 10 ? 1 : 0)} km`;
  }

  function status(msg) {
    statusEl.textContent = msg || '';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
})();
