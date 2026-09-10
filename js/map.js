/* ============================================================
   2nd Home — map.js  (v2 — globals exposed on window)
   Leaflet map helpers for location picking and display
   ============================================================ */

'use strict';

// Expose picker state globally so owner.js/auth.html can read it
window._pickerMap    = null;
window._pickerMarker = null;

function waitForLeaflet(cb) {
  if (typeof L !== 'undefined') { cb(); return; }
  let tries = 0;
  const interval = setInterval(() => {
    if (typeof L !== 'undefined') { clearInterval(interval); cb(); }
    if (++tries > 50) clearInterval(interval);
  }, 200);
}

// ── Burgundy map icon factory ──
function makeIcon(size = 34) {
  const half = size / 2;
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px;height:${size}px;
      background:var(--burgundy,#5c0a14);
      border:3px solid var(--gold,#c9a84c);
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 3px 12px rgba(0,0,0,0.45);
    "></div>`,
    iconAnchor: [half, size],
    popupAnchor: [0, -(size + 4)],
  });
}

// ── View Map (listing detail page) ──
function initDetailMap(lat, lng, title) {
  waitForLeaflet(() => {
    const el = document.getElementById('listing-map');
    if (!el) return;
    if (el._leaflet_id) return; // already inited

    const map = L.map('listing-map', { zoomControl: true, scrollWheelZoom: false });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([lat, lng], { icon: makeIcon(36) }).addTo(map);
    marker.bindPopup(`<b>${sanitize ? sanitize(title) : title}</b><br>📍 Property Location`).openPopup();
    map.setView([lat, lng], 15);

    // Also show nearby listings
    const listings = (typeof Listings !== 'undefined') ? Listings.getApproved().filter(l => l.lat && l.lng && l.id !== undefined) : [];
    listings.forEach(l => {
      if (Math.abs(l.lat - lat) > 0.3 || Math.abs(l.lng - lng) > 0.3) return;
      const sm = L.circleMarker([l.lat, l.lng], { radius: 7, color: '#c9a84c', fillColor: '#5c0a14', fillOpacity: 0.8, weight: 2 }).addTo(map);
      sm.bindPopup(`<a href="listing-detail.html?id=${l.id}" style="color:#5c0a14;font-weight:600;">${sanitize ? sanitize(l.title.substring(0,40)) : l.title}</a>`);
    });
  });
}

// ── Interactive Location Picker ──
function initPickerMap(initialLat, initialLng, onPick) {
  waitForLeaflet(() => {
    const el = document.getElementById('owner-map');
    if (!el) return;

    // Destroy previous instance
    if (el._leaflet_id) {
      try { window._pickerMap && window._pickerMap.remove(); } catch(e) {}
      el._leaflet_id = null;
      el.innerHTML = '';
    }

    const defLat = initialLat || 20.5937;
    const defLng = initialLng || 78.9629;

    const map = L.map('owner-map', { zoomControl: true });
    window._pickerMap = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    const icon = makeIcon(32);

    function placeMarker(lat, lng) {
      if (window._pickerMarker) map.removeLayer(window._pickerMarker);
      window._pickerMarker = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
      window._pickerMarker.on('dragend', () => {
        const p = window._pickerMarker.getLatLng();
        updateCoordsDisplay(p.lat, p.lng);
        if (onPick) onPick(p.lat, p.lng);
      });
      updateCoordsDisplay(lat, lng);
      if (onPick) onPick(lat, lng);
    }

    if (initialLat && initialLng) {
      map.setView([initialLat, initialLng], 15);
      placeMarker(initialLat, initialLng);
    } else {
      map.setView([defLat, defLng], 5);
    }

    map.on('click', e => placeMarker(e.latlng.lat, e.latlng.lng));

    // City search
    const searchInput = document.getElementById('map-city-search');
    const searchBtn   = document.getElementById('map-city-btn');
    if (searchBtn) {
      const doSearch = () => searchCity(searchInput?.value?.trim() || '', map, placeMarker);
      searchBtn.addEventListener('click', doSearch);
      searchInput?.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
    }
  });
}

// ── Auth page location map ──
function initAuthPickerMap(elId, onPick) {
  waitForLeaflet(() => {
    const el = document.getElementById(elId);
    if (!el || el._leaflet_id) return;

    const map = L.map(elId, { zoomControl: true });
    window._authPickerMap    = map;
    window._authPickerMarker = null;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 19,
    }).addTo(map);
    map.setView([20.5937, 78.9629], 5);

    map.on('click', e => {
      const { lat, lng } = e.latlng;
      if (window._authPickerMarker) map.removeLayer(window._authPickerMarker);
      window._authPickerMarker = L.marker([lat, lng], { icon: makeIcon(28), draggable: true }).addTo(map);
      window._authPickerMarker.on('dragend', () => {
        const p = window._authPickerMarker.getLatLng();
        if (onPick) onPick(p.lat, p.lng);
      });
      if (onPick) onPick(lat, lng);
    });
  });
}

function updateCoordsDisplay(lat, lng) {
  const el = document.getElementById('map-coords-display') || document.querySelector('.map-coords');
  if (el) el.textContent = `📍 Pinned: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

async function searchCity(city, map, onFound) {
  if (!city) return;
  try {
    const res  = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)},India&format=json&limit=1`);
    const data = await res.json();
    if (data && data.length > 0) {
      const lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
      map.setView([lat, lng], 14);
      if (onFound) onFound(lat, lng);
    } else {
      if (typeof showToast === 'function') showToast('City not found. Try adding state name.', 'error');
    }
  } catch(e) {
    if (typeof showToast === 'function') showToast('Could not search. Check your internet.', 'error');
  }
}
