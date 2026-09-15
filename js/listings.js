/* ============================================================
   2nd Home — listings.js
   Listings browse page logic (search, filter, sort, paginate)
   ============================================================ */

'use strict';

const LISTINGS_PER_PAGE = 9;
let currentPage  = 1;
let filteredList = [];

// ── Read URL params ──
function getUrlParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    type:     p.get('type')     || '',
    city:     p.get('city')     || '',
    duration: p.get('duration') || '',
    keyword:  p.get('keyword')  || '',
    maxPrice: p.get('maxPrice') || '',
  };
}

// ── Apply filters and re-render ──
function applyFilters() {
  const session = Auth.getSession();
  const userId  = (session?.role === 'renter') ? session.id : null;

  // Collect filter values
  const typeChecks = [...document.querySelectorAll('.filter-type-check:checked')].map(c => c.value);
  const city     = (document.getElementById('filter-city')?.value || '').trim();
  const maxP     = document.getElementById('filter-price')?.value || '';
  const duration = document.getElementById('filter-duration')?.value || '';
  const keyword  = (document.getElementById('filter-keyword')?.value || '').trim().toLowerCase();
  const sortBy   = document.getElementById('sort-select')?.value || 'newest';

  // Fetch from DB
  let results = Listings.getApproved();

  // Filter
  if (typeChecks.length > 0 && !typeChecks.includes('all')) {
    results = results.filter(l => typeChecks.includes(l.type));
  }
  if (city)    results = results.filter(l => l.city.toLowerCase().includes(city.toLowerCase()) || l.address.toLowerCase().includes(city.toLowerCase()));
  if (maxP && Number(maxP) < 100000) results = results.filter(l => !l.priceMonthly || Number(l.priceMonthly) <= Number(maxP));
  if (duration === 'daily')   results = results.filter(l => l.priceDaily);
  if (duration === 'weekly')  results = results.filter(l => l.priceWeekly);
  if (duration === 'monthly') results = results.filter(l => l.priceMonthly);
  if (keyword) results = results.filter(l =>
    l.title.toLowerCase().includes(keyword) ||
    (l.description||'').toLowerCase().includes(keyword) ||
    l.city.toLowerCase().includes(keyword) ||
    (l.amenities||[]).some(a => a.toLowerCase().includes(keyword))
  );

  // Sort
  if (sortBy === 'price-asc')  results.sort((a,b) => (a.priceMonthly||a.priceWeekly||a.priceDaily||0) - (b.priceMonthly||b.priceWeekly||b.priceDaily||0));
  if (sortBy === 'price-desc') results.sort((a,b) => (b.priceMonthly||b.priceWeekly||b.priceDaily||0) - (a.priceMonthly||a.priceWeekly||a.priceDaily||0));
  if (sortBy === 'newest')     results.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (sortBy === 'views')      results.sort((a,b) => (b.views||0) - (a.views||0));
  if (sortBy === 'nearby' && window._userLat && window._userLng) {
    results = results.filter(l => l.lat && l.lng);
    results.sort((a,b) => calcListingDist(a) - calcListingDist(b));
  }

  filteredList = results;
  currentPage  = 1;

  // Update count
  const countEl = document.getElementById('results-count');
  if (countEl) countEl.textContent = `${results.length} propert${results.length === 1 ? 'y' : 'ies'} found`;

  renderPage(userId);
  renderPagination();
}

// ── Render current page ──
function renderPage(userId) {
  const grid  = document.getElementById('listings-grid');
  if (!grid) return;

  const start = (currentPage - 1) * LISTINGS_PER_PAGE;
  const slice = filteredList.slice(start, start + LISTINGS_PER_PAGE);

  if (slice.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <span class="empty-icon">🔍</span>
        <h3>No properties found</h3>
        <p>Try adjusting your filters or search a different city.</p>
        <button class="btn btn-outline mt-16" onclick="clearFilters()">Clear All Filters</button>
      </div>`;
    return;
  }

  grid.innerHTML = slice.map(l => renderListingCard(l, userId)).join('');
}

// ── Render Pagination ──
function renderPagination() {
  const container = document.getElementById('pagination');
  if (!container) return;

  const total = Math.ceil(filteredList.length / LISTINGS_PER_PAGE);
  if (total <= 1) { container.innerHTML = ''; return; }

  let html = '';
  if (currentPage > 1)     html += `<button class="page-btn" onclick="gotoPage(${currentPage-1})">←</button>`;
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - currentPage) <= 2) {
      html += `<button class="page-btn${i===currentPage?' active':''}" onclick="gotoPage(${i})">${i}</button>`;
    } else if (Math.abs(i - currentPage) === 3) {
      html += `<span style="padding:0 8px;color:var(--gray-mid);">…</span>`;
    }
  }
  if (currentPage < total) html += `<button class="page-btn" onclick="gotoPage(${currentPage+1})">→</button>`;
  container.innerHTML = html;
}

function gotoPage(n) {
  currentPage = n;
  const session = Auth.getSession();
  const userId  = (session?.role === 'renter') ? session.id : null;
  renderPage(userId);
  renderPagination();
  window.scrollTo({ top: 300, behavior: 'smooth' });
}

// ── Pre-fill from URL params ──
function prefillFromUrl() {
  const params = getUrlParams();

  // Type checkboxes
  if (params.type) {
    document.querySelectorAll('.filter-type-check').forEach(c => {
      c.checked = (c.value === params.type);
    });
  } else {
    const allCheck = document.querySelector('.filter-type-check[value="all"]');
    if (allCheck) allCheck.checked = true;
  }
  if (params.city) {
    const el = document.getElementById('filter-city');
    if (el) el.value = params.city;
  }
  if (params.duration) {
    const el = document.getElementById('filter-duration');
    if (el) el.value = params.duration;
  }
}

// ── Clear filters ──
function clearFilters() {
  document.querySelectorAll('.filter-type-check').forEach(c => c.checked = false);
  const allCheck = document.querySelector('.filter-type-check[value="all"]');
  if (allCheck) allCheck.checked = true;
  const cityEl = document.getElementById('filter-city');
  if (cityEl) cityEl.value = '';
  const priceEl = document.getElementById('filter-price');
  if (priceEl) { priceEl.value = priceEl.max; updatePriceDisplay(); }
  const durEl = document.getElementById('filter-duration');
  if (durEl) durEl.value = '';
  const kwEl = document.getElementById('filter-keyword');
  if (kwEl) kwEl.value = '';
  applyFilters();
}

// ── Price slider display ──
function updatePriceDisplay() {
  const el   = document.getElementById('filter-price');
  const disp = document.getElementById('price-display');
  if (el && disp) {
    const val = Number(el.value);
    disp.textContent = val >= 100000 ? 'Any' : `₹${val.toLocaleString('en-IN')}`;
    const pct = ((val - el.min) / (el.max - el.min)) * 100;
    el.style.setProperty('--val', pct + '%');
  }
}

// ── Haversine distance helper ──
function calcListingDist(listing) {
  if (!window._userLat || !window._userLng || !listing.lat || !listing.lng) return 99999;
  const R = 6371;
  const dLat = (listing.lat - window._userLat) * Math.PI / 180;
  const dLng = (listing.lng - window._userLng) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(window._userLat*Math.PI/180) * Math.cos(listing.lat*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  prefillFromUrl();
  updatePriceDisplay();
  applyFilters();

  // Filter price slider live update
  document.getElementById('filter-price')?.addEventListener('input', updatePriceDisplay);

  // Sort change
  document.getElementById('sort-select')?.addEventListener('change', applyFilters);

  // Mobile filter toggle
  const filterToggle  = document.getElementById('filter-toggle');
  const filterSidebar = document.querySelector('.filter-sidebar');
  if (filterToggle && filterSidebar) {
    filterToggle.addEventListener('click', () => filterSidebar.classList.toggle('open'));
    document.addEventListener('click', e => {
      if (!filterSidebar.contains(e.target) && !filterToggle.contains(e.target)) {
        filterSidebar.classList.remove('open');
      }
    });
  }
});

