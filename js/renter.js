/* ============================================================
   2nd Home — renter.js
   Renter dashboard: search, favorites, bookings, messages
   ============================================================ */

'use strict';

document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.requireAuth('renter')) return;

  const session = Auth.getSession();
  document.getElementById('renter-name').textContent    = session.name;
  document.getElementById('renter-initial').textContent = session.name.charAt(0).toUpperCase();
  document.getElementById('renter-email').textContent   = session.email;

  // Nav items
  document.querySelectorAll('.dash-nav-item').forEach(item => {
    item.addEventListener('click', () => showPanel(item.dataset.panel));
  });

  document.getElementById('logout-btn')?.addEventListener('click', () => Auth.logout());

  showPanel('search');
  renderStats();
});

function showPanel(name) {
  document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.dash-nav-item').forEach(i => i.classList.remove('active'));

  const panel = document.getElementById('panel-' + name);
  const nav   = document.querySelector(`.dash-nav-item[data-panel="${name}"]`);
  if (panel) panel.classList.add('active');
  if (nav)   nav.classList.add('active');

  if (name === 'search')    renderSearchPanel();
  if (name === 'favorites') renderFavorites();
  if (name === 'bookings')  renderRenterBookings();
  if (name === 'messages')  renderRenterMessages();
}

// ── STATS ──
function renderStats() {
  const session  = Auth.getSession();
  const bookings = Bookings.getByRenter(session.id);
  const favs     = Favorites.getAll(session.id);
  const messages = Messages.getRenterInbox(session.id);

  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  el('stat-bookings', bookings.length);
  el('stat-favs',     favs.length);
  el('stat-msgs',     messages.length);
}

// ── SEARCH PANEL ──
function renderSearchPanel() {
  const session = Auth.getSession();

  const form = document.getElementById('renter-search-form');
  if (!form) return;

  form.onsubmit = (e) => {
    e.preventDefault();
    const type     = document.getElementById('s-type').value;
    const city     = document.getElementById('s-city').value.trim();
    const duration = document.getElementById('s-duration').value;
    const maxPrice = document.getElementById('s-price').value;
    const keyword  = document.getElementById('s-keyword').value.trim();

    const results  = Listings.search({ type, city, maxPrice, duration, keyword });
    const grid     = document.getElementById('search-results-grid');

    if (!grid) return;
    if (results.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><span class="empty-icon">🔍</span><h3>No results found</h3><p>Try different criteria.</p></div>`;
      return;
    }
    grid.innerHTML = results.map(l => renderListingCard(l, session.id)).join('');

    // Scroll to results
    grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

// ── FAVORITES ──
function renderFavorites() {
  const session   = Auth.getSession();
  const favIds    = Favorites.getAll(session.id);
  const container = document.getElementById('favorites-container');
  if (!container) return;

  if (favIds.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">♥</span><h3>No favourites yet</h3><p>Heart a listing to save it here.</p><a href="listings.html" class="btn btn-outline mt-16">Browse Listings</a></div>`;
    return;
  }

  const favListings = favIds.map(id => Listings.getById(id)).filter(Boolean);
  if (favListings.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">♥</span><h3>No favourites yet</h3></div>`;
    return;
  }

  container.innerHTML = `<div class="listings-grid">${favListings.map(l => renderListingCard(l, session.id)).join('')}</div>`;
}

// ── BOOKINGS ──
function renderRenterBookings() {
  const session   = Auth.getSession();
  const bookings  = Bookings.getByRenter(session.id);
  const container = document.getElementById('renter-bookings-container');
  if (!container) return;

  if (bookings.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">📅</span><h3>No bookings yet</h3><p>Book a listing to see it here.</p><a href="listings.html" class="btn btn-outline mt-16">Browse Listings</a></div>`;
    return;
  }

  bookings.sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));

  container.innerHTML = bookings.map(b => `
    <div class="booking-card">
      <div class="booking-info">
        <h4>${sanitize(b.listingTitle)}</h4>
        <p>📅 ${sanitize(b.startDate)} → ${sanitize(b.endDate)} &nbsp;·&nbsp; ${sanitize(b.duration)}</p>
        <p>💰 ₹${Number(b.totalPrice).toLocaleString('en-IN')}</p>
        <p>Submitted: ${fmt(b.createdAt)}</p>
      </div>
      <div>
        <span class="badge badge-${b.status === 'approved' ? 'available' : b.status === 'rejected' ? 'occupied' : 'pending'}" style="padding:8px 16px;font-size:0.85rem;">${b.status.charAt(0).toUpperCase()+b.status.slice(1)}</span>
        <div style="margin-top:10px;">
          <a href="listing-detail.html?id=${b.listingId}" class="btn btn-outline btn-sm">View Property</a>
        </div>
      </div>
    </div>`).join('');
}

// ── MESSAGES ──
function renderRenterMessages() {
  const session   = Auth.getSession();
  const inbox     = Messages.getRenterInbox(session.id);
  const container = document.getElementById('renter-messages-container');
  if (!container) return;

  if (inbox.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">💬</span><h3>No messages yet</h3><p>Contact an owner from a listing detail page.</p></div>`;
    return;
  }

  container.innerHTML = inbox.map(msg => {
    const listing = Listings.getById(msg.listingId);
    const owner   = Auth.getOwnerById(msg.ownerId);
    return `
    <div class="inquiry-card" onclick="openRenterConversation('${msg.listingId}','${msg.ownerId}')">
      <div class="inquiry-header">
        <h4>🏠 ${sanitize(listing?.title || 'Listing')}</h4>
        <span class="time">${fmtTime(msg.createdAt)}</span>
      </div>
      <div class="inquiry-meta">👤 Owner: ${sanitize(owner?.name || 'Owner')} &nbsp;·&nbsp; 📍 ${sanitize(listing?.city || '')}</div>
      <div class="inquiry-preview">${msg.sender === 'renter' ? '🔵 You: ' : '🟢 Owner: '} ${sanitize(msg.text.substring(0,90))}…</div>
    </div>`;
  }).join('');
}

function openRenterConversation(listingId, ownerId) {
  const session = Auth.getSession();
  const msgs    = Messages.getConversation(listingId, session.id).sort((a,b) => new Date(a.createdAt)-new Date(b.createdAt));
  const listing = Listings.getById(listingId);
  const owner   = Auth.getOwnerById(ownerId) || { name: 'Owner' };

  const modal  = document.getElementById('conv-modal');
  const title  = document.getElementById('conv-modal-title');
  const thread = document.getElementById('conv-thread');
  const input  = document.getElementById('conv-input');

  if (title)  title.textContent = `Chat with ${owner.name} — ${listing?.title || 'Listing'}`;
  if (thread) thread.innerHTML  = msgs.length === 0 ? '<div style="text-align:center;color:var(--gray-mid);padding:20px;">No messages yet.</div>' :
    msgs.map(m => `
      <div class="message-bubble ${m.sender === 'renter' ? 'sent' : 'received'}">
        ${sanitize(m.text)}
        <div class="message-time">${fmtTime(m.createdAt)}</div>
      </div>`).join('');

  if (thread) thread.scrollTop = thread.scrollHeight;

  const sendBtn = document.getElementById('conv-send');
  const newSend = sendBtn.cloneNode(true);
  sendBtn.parentNode.replaceChild(newSend, sendBtn);

  newSend.addEventListener('click', () => {
    const text = input.value.trim();
    if (!text) return;
    Messages.send({ listingId, ownerId, renterId: session.id, sender: 'renter', senderName: session.name, text });
    input.value = '';
    openRenterConversation(listingId, ownerId);
  });

  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); newSend.click(); } });

  openModal('conv-modal');
}

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});
