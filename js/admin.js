/* ============================================================
   2nd Home — admin.js
   Admin panel: users, owners, listings, bookings management
   ============================================================ */

'use strict';

let adminTab = 'dashboard';

document.addEventListener('DOMContentLoaded', () => {
  // Only initialize admin panel if already authenticated (admin-login-screen handles the rest)
  if (Auth.isAdmin()) {
    document.getElementById('admin-login-screen').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'block';
    _initAdminPanel();
  }

  document.querySelectorAll('.dash-nav-item').forEach(item => {
    item.addEventListener('click', () => showAdminPanel(item.dataset.panel));
  });

  document.getElementById('logout-btn')?.addEventListener('click', () => Auth.logout());
});


function _initAdminPanel() {
  showAdminPanel('dashboard');
}

function showAdminPanel(name) {
  document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.dash-nav-item').forEach(i => i.classList.remove('active'));

  const panel = document.getElementById('panel-' + name);
  const nav   = document.querySelector(`.dash-nav-item[data-panel="${name}"]`);
  if (panel) panel.classList.add('active');
  if (nav)   nav.classList.add('active');

  const renders = {
    dashboard: renderAdminDashboard,
    listings:  renderAdminListings,
    owners:    renderAdminOwners,
    users:     renderAdminUsers,
    bookings:  renderAdminBookings,
    messages:  renderAdminMessages,
  };
  if (renders[name]) renders[name]();
}

// ── DASHBOARD ──
function renderAdminDashboard() {
  const listings = Listings.getAll();
  const owners   = getDB(DB.OWNERS);
  const users    = getDB(DB.USERS);
  const bookings = Bookings.getAll();
  const msgs     = Messages.getAll();

  const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  set('stat-total-listings', listings.length);
  set('stat-pending',        listings.filter(l => l.status === 'pending').length);
  set('stat-owners',         owners.length);
  set('stat-users',          users.length);
  set('stat-bookings',       bookings.length);
  set('stat-messages',       msgs.length);

  // Recent listings
  const container = document.getElementById('recent-listings-container');
  if (container) {
    const recent = [...listings].sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5);
    container.innerHTML = recent.length === 0 ? '<p style="color:var(--gray-dk);">No listings yet.</p>' :
      recent.map(l => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid var(--ivory-dk);">
          <div>
            <strong style="font-size:0.92rem;">${sanitize(l.title)}</strong>
            <p style="font-size:0.8rem;color:var(--gray-dk);">${getCategoryLabel(l.type)} · ${sanitize(l.city)} · ${fmt(l.createdAt)}</p>
          </div>
          <span class="badge badge-${l.status === 'approved' ? 'available' : l.status === 'pending' ? 'pending' : 'occupied'}">${l.status}</span>
        </div>`).join('');
  }

  // Render pending quick view if the function exists
  if (typeof renderPendingQuick === 'function') renderPendingQuick();
}

// ── LISTINGS MANAGEMENT ──
function renderAdminListings() {
  const listings  = Listings.getAll().sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
  const container = document.getElementById('admin-listings-container');
  if (!container) return;

  if (listings.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">🏠</span><h3>No listings</h3></div>`;
    return;
  }

  container.innerHTML = `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Title</th><th>Type</th><th>City</th><th>Owner</th><th>Price/mo</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${listings.map(l => {
            const owner = Auth.getOwnerById(l.ownerId) || { name: '—' };
            return `<tr>
              <td><a href="listing-detail.html?id=${l.id}" target="_blank" style="color:var(--burgundy);font-weight:600;">${sanitize(l.title.substring(0,35))}${l.title.length>35?'…':''}</a></td>
              <td>${sanitize(getCategoryLabel(l.type))}</td>
              <td>${sanitize(l.city)}</td>
              <td>${sanitize(owner.name)}</td>
              <td>${l.priceMonthly ? '₹'+Number(l.priceMonthly).toLocaleString('en-IN') : '—'}</td>
              <td><span class="badge badge-${l.status==='approved'?'available':l.status==='pending'?'pending':'occupied'}">${l.status}</span>${l.featured?'<span class="badge badge-featured" style="margin-left:4px;">⭐</span>':''}</td>
              <td style="white-space:nowrap;">
                ${l.status==='pending'?`<button class="btn btn-success btn-sm" onclick="adminApproveListing('${l.id}')">Approve</button> `:''}
                <button class="btn btn-sm ${l.featured?'btn-outline':'btn-primary'}" onclick="adminToggleFeatured('${l.id}')">${l.featured?'Unfeature':'Feature'}</button>
                <button class="btn btn-danger btn-sm" onclick="adminDeleteListing('${l.id}')">Delete</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function adminApproveListing(id) {
  Listings.update(id, { status: 'approved' });
  showToast('Listing approved!', 'success');
  renderAdminListings();
  renderAdminDashboard();
}
function adminToggleFeatured(id) {
  const l = Listings.getById(id);
  if (!l) return;
  Listings.update(id, { featured: !l.featured });
  showToast(l.featured ? 'Listing unfeatured.' : 'Listing featured!', 'success');
  renderAdminListings();
}
function adminDeleteListing(id) {
  if (!confirm('Delete this listing permanently?')) return;
  Listings.delete(id);
  showToast('Listing deleted.', 'success');
  renderAdminListings();
}

// ── OWNERS MANAGEMENT ──
function renderAdminOwners() {
  const owners    = getDB(DB.OWNERS).sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
  const container = document.getElementById('admin-owners-container');
  if (!container) return;

  if (owners.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">👤</span><h3>No owners registered</h3></div>`;
    return;
  }

  container.innerHTML = `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>City</th><th>Joined</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${owners.map(o => `
            <tr>
              <td><strong>${sanitize(o.name)}</strong></td>
              <td>${sanitize(o.email)}</td>
              <td>${sanitize(o.phone || '—')}</td>
              <td>${sanitize(o.city || '—')}</td>
              <td>${fmt(o.createdAt)}</td>
              <td><span class="badge badge-${o.status==='active'?'available':'occupied'}">${o.status}</span>${o.verified?'<span class="badge badge-featured" style="margin-left:4px;">✓</span>':''}</td>
              <td style="white-space:nowrap;">
                <button class="btn btn-sm ${o.status==='active'?'btn-danger':'btn-success'}" onclick="adminToggleOwner('${o.id}')">
                  ${o.status==='active'?'Suspend':'Restore'}
                </button>
                <button class="btn btn-primary btn-sm" onclick="adminVerifyOwner('${o.id}')">${o.verified?'Unverify':'Verify'}</button>
                <button class="btn btn-danger btn-sm" onclick="adminDeleteOwner('${o.id}')">Delete</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function adminToggleOwner(id) {
  const owners = getDB(DB.OWNERS);
  const idx    = owners.findIndex(o => o.id === id);
  if (idx === -1) return;
  owners[idx].status = owners[idx].status === 'active' ? 'suspended' : 'active';
  setDB(DB.OWNERS, owners);
  showToast(`Owner ${owners[idx].status === 'active' ? 'restored' : 'suspended'}.`, 'success');
  renderAdminOwners();
}
function adminVerifyOwner(id) {
  const owners = getDB(DB.OWNERS);
  const idx    = owners.findIndex(o => o.id === id);
  if (idx === -1) return;
  owners[idx].verified = !owners[idx].verified;
  setDB(DB.OWNERS, owners);
  showToast(`Owner ${owners[idx].verified ? 'verified' : 'unverified'}.`, 'success');
  renderAdminOwners();
}
function adminDeleteOwner(id) {
  if (!confirm('Delete this owner and all their listings?')) return;
  // Delete all their listings
  Listings.getByOwner(id).forEach(l => Listings.delete(l.id));
  // Delete owner
  setDB(DB.OWNERS, getDB(DB.OWNERS).filter(o => o.id !== id));
  showToast('Owner deleted.', 'success');
  renderAdminOwners();
}

// ── USERS MANAGEMENT ──
function renderAdminUsers() {
  const users     = getDB(DB.USERS).sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
  const container = document.getElementById('admin-users-container');
  if (!container) return;

  if (users.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">👥</span><h3>No renters registered</h3></div>`;
    return;
  }

  container.innerHTML = `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Joined</th><th>Favourites</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${users.map(u => `
            <tr>
              <td><strong>${sanitize(u.name)}</strong></td>
              <td>${sanitize(u.email)}</td>
              <td>${sanitize(u.phone || '—')}</td>
              <td>${fmt(u.createdAt)}</td>
              <td>${(u.favorites || []).length}</td>
              <td><span class="badge badge-${u.status==='active'?'available':'occupied'}">${u.status}</span></td>
              <td style="white-space:nowrap;">
                <button class="btn btn-sm ${u.status==='active'?'btn-danger':'btn-success'}" onclick="adminToggleUser('${u.id}')">
                  ${u.status==='active'?'Suspend':'Restore'}
                </button>
                <button class="btn btn-danger btn-sm" onclick="adminDeleteUser('${u.id}')">Delete</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function adminToggleUser(id) {
  const users = getDB(DB.USERS);
  const idx   = users.findIndex(u => u.id === id);
  if (idx === -1) return;
  users[idx].status = users[idx].status === 'active' ? 'suspended' : 'active';
  setDB(DB.USERS, users);
  showToast(`Renter ${users[idx].status === 'active' ? 'restored' : 'suspended'}.`, 'success');
  renderAdminUsers();
}
function adminDeleteUser(id) {
  if (!confirm('Delete this renter account?')) return;
  setDB(DB.USERS, getDB(DB.USERS).filter(u => u.id !== id));
  showToast('Renter deleted.', 'success');
  renderAdminUsers();
}

// ── BOOKINGS ──
function renderAdminBookings() {
  const bookings  = Bookings.getAll().sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
  const container = document.getElementById('admin-bookings-container');
  if (!container) return;

  if (bookings.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">📅</span><h3>No bookings yet</h3></div>`;
    return;
  }

  container.innerHTML = `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th>Listing</th><th>Renter</th><th>Duration</th><th>Dates</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          ${bookings.map(b => `
            <tr>
              <td><a href="listing-detail.html?id=${b.listingId}" target="_blank" style="color:var(--burgundy);">${sanitize(b.listingTitle?.substring(0,30)||'—')}…</a></td>
              <td>${sanitize(b.renterName)}<br><small>${sanitize(b.renterEmail)}</small></td>
              <td>${sanitize(b.duration)}</td>
              <td style="white-space:nowrap;">${sanitize(b.startDate)} → ${sanitize(b.endDate)}</td>
              <td>₹${Number(b.totalPrice).toLocaleString('en-IN')}</td>
              <td><span class="badge badge-${b.status==='approved'?'available':b.status==='rejected'?'occupied':'pending'}">${b.status}</span></td>
              <td><button class="btn btn-danger btn-sm" onclick="adminDeleteBooking('${b.id}')">Remove</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function adminDeleteBooking(id) {
  if (!confirm('Remove this booking record?')) return;
  setDB(DB.BOOKINGS, getDB(DB.BOOKINGS).filter(b => b.id !== id));
  showToast('Booking removed.', 'success');
  renderAdminBookings();
}

// ── MESSAGES ──
function renderAdminMessages() {
  const msgs      = Messages.getAll().sort((a,b) => new Date(b.createdAt)-new Date(a.createdAt));
  const container = document.getElementById('admin-messages-container');
  if (!container) return;

  if (msgs.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">💬</span><h3>No messages</h3></div>`;
    return;
  }

  container.innerHTML = `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th>Time</th><th>Sender</th><th>To</th><th>Listing</th><th>Message</th><th>Action</th></tr></thead>
        <tbody>
          ${msgs.map(m => {
            const listing = Listings.getById(m.listingId);
            return `<tr>
              <td style="white-space:nowrap;">${fmtTime(m.createdAt)}</td>
              <td>${sanitize(m.senderName || m.sender)}</td>
              <td><span class="badge badge-${m.sender==='renter'?'pg':'shop'}">${m.sender==='renter'?'Owner':'Renter'}</span></td>
              <td>${sanitize(listing?.title?.substring(0,25)||'—')}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sanitize(m.text)}</td>
              <td><button class="btn btn-danger btn-sm" onclick="adminDeleteMsg('${m.id}')">Delete</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function adminDeleteMsg(id) {
  setDB(DB.MESSAGES, getDB(DB.MESSAGES).filter(m => m.id !== id));
  showToast('Message deleted.', 'success');
  renderAdminMessages();
}
