/* ============================================================
   2nd Home — owner.js  (v2 — full fixes)
   Owner dashboard: listings CRUD, photos, video, map, inbox
   ============================================================ */

'use strict';

// ── State ──
let editingListingId = null;
let pickedLat = null;
let pickedLng = null;
let photoFiles     = [];
let existingPhotos = [];
let videoFile      = null;

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.requireAuth('owner')) return;

  const session = Auth.getSession();
  const nameEl  = document.getElementById('owner-name');
  const initEl  = document.getElementById('owner-initial');
  const emailEl = document.getElementById('owner-email');
  if (nameEl)  nameEl.textContent  = session.name;
  if (initEl)  initEl.textContent  = session.name.charAt(0).toUpperCase();
  if (emailEl) emailEl.textContent = session.email;

  // Nav items
  document.querySelectorAll('.dash-nav-item[data-panel]').forEach(item => {
    item.addEventListener('click', () => showPanel(item.dataset.panel));
  });

  document.getElementById('logout-btn')?.addEventListener('click', () => Auth.logout());

  // Check hash
  const hash = window.location.hash.replace('#','');
  showPanel(hash || 'listings');

  updateInquiryBadge();

  // Amenity checkbox visual
  document.querySelectorAll('.amenity-check-input').forEach(cb => {
    cb.addEventListener('change', () => cb.closest('.amenity-check')?.classList.toggle('checked', cb.checked));
  });

  // Desc count
  document.getElementById('listing-desc')?.addEventListener('input', function() {
    const el = document.getElementById('desc-count');
    if (el) el.textContent = this.value.length;
  });

  // Photo upload
  const photoInput = document.getElementById('photo-input');
  const photoArea  = document.getElementById('photo-area');
  if (photoArea && photoInput) {
    photoArea.addEventListener('click', () => photoInput.click());
    photoArea.addEventListener('dragover', e => { e.preventDefault(); photoArea.classList.add('drag-over'); });
    photoArea.addEventListener('dragleave', () => photoArea.classList.remove('drag-over'));
    photoArea.addEventListener('drop', e => { e.preventDefault(); photoArea.classList.remove('drag-over'); handlePhotoFiles(e.dataTransfer.files); });
    photoInput.addEventListener('change', () => handlePhotoFiles(photoInput.files));
  }

  // Video upload
  const videoInput = document.getElementById('video-input');
  const videoArea  = document.getElementById('video-area');
  if (videoArea && videoInput) {
    videoArea.addEventListener('click', () => videoInput.click());
    videoInput.addEventListener('change', () => handleVideoFile(videoInput.files[0]));
  }

  // Form submit
  document.getElementById('add-listing-form')?.addEventListener('submit', handleListingSubmit);

  // Availability toggle
  document.getElementById('availability-toggle')?.addEventListener('change', function() {
    const el = document.getElementById('avail-text');
    if (el) el.textContent = this.checked ? 'Available Now' : 'Not Available';
  });
});

// ── Panel Navigation ──
function showPanel(name) {
  document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.dash-nav-item').forEach(i => i.classList.remove('active'));

  const panel = document.getElementById('panel-' + name);
  const nav   = document.querySelector(`.dash-nav-item[data-panel="${name}"]`);
  if (panel) panel.classList.add('active');
  if (nav)   nav.classList.add('active');

  if (name === 'listings')  renderMyListings();
  if (name === 'inquiries') renderInquiries();
  if (name === 'bookings')  renderOwnerBookings();
  if (name === 'add')       initAddListingPanel();
}

// ── MY LISTINGS ──
function renderMyListings() {
  const session   = Auth.getSession();
  const list      = Listings.getByOwner(session.id);
  const container = document.getElementById('my-listings-container');
  if (!container) return;

  // Stats
  const approved = list.filter(l => l.status === 'approved').length;
  const pending  = list.filter(l => l.status === 'pending').length;
  const views    = list.reduce((sum, l) => sum + (l.views || 0), 0);

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:16px;margin-bottom:28px;">
      <div class="stat-card"><div class="stat-icon">🏠</div><span class="stat-val">${list.length}</span><span class="stat-lbl">Total Listings</span></div>
      <div class="stat-card" style="border-left-color:#27ae60;"><div class="stat-icon">✓</div><span class="stat-val">${approved}</span><span class="stat-lbl">Approved</span></div>
      <div class="stat-card" style="border-left-color:#f39c12;"><div class="stat-icon">⏳</div><span class="stat-val">${pending}</span><span class="stat-lbl">Pending</span></div>
      <div class="stat-card" style="border-left-color:#2980b9;"><div class="stat-icon">👁</div><span class="stat-val">${views}</span><span class="stat-lbl">Total Views</span></div>
    </div>` + (list.length === 0
    ? `<div class="empty-state"><span class="empty-icon">📋</span><h3>No listings yet</h3><p>Add your first property to start receiving inquiries.</p><button class="btn btn-primary mt-16" onclick="showPanel('add')">➕ Add Your First Listing</button></div>`
    : list.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(l => renderManageCard(l)).join('')
  );
}

function renderManageCard(l) {
  const photo = l.photos?.[0] || null;
  return `
  <div class="manage-listing-card" id="mlc-${l.id}">
    <div class="manage-listing-img">
      ${photo
        ? `<img src="${sanitize(photo)}" alt="${sanitize(l.title)}" onerror="this.parentElement.innerHTML='<div class=no-image-placeholder>🏠</div>'">`
        : `<div class="no-image-placeholder" style="height:120px;font-size:2rem;">🏠</div>`}
    </div>
    <div class="manage-listing-info">
      <h4>${sanitize(l.title)}</h4>
      <p>📍 ${sanitize(l.city)} &nbsp;·&nbsp; ${getCategoryLabel(l.type)} &nbsp;·&nbsp; 👁 ${l.views||0} views</p>
      <p style="margin:6px 0;">
        <span class="badge badge-${l.status==='approved'?'available':l.status==='pending'?'pending':'occupied'}">${l.status}</span>
        ${l.featured ? '<span class="badge badge-featured" style="margin-left:6px;">⭐ Featured</span>' : ''}
        ${!l.available ? '<span class="badge badge-occupied" style="margin-left:6px;">Unavailable</span>' : ''}
      </p>
      <p style="font-size:0.8rem;color:var(--gray-dk);">
        ${l.priceMonthly ? `₹${Number(l.priceMonthly).toLocaleString('en-IN')}/mo` : l.priceWeekly ? `₹${Number(l.priceWeekly).toLocaleString('en-IN')}/wk` : ''}
        &nbsp;·&nbsp; Added ${fmt(l.createdAt)}
        ${l.amenities?.length ? `&nbsp;·&nbsp; ${l.amenities.slice(0,3).join(', ')}${l.amenities.length>3?'…':''}` : ''}
      </p>
    </div>
    <div class="manage-listing-actions">
      <a href="listing-detail.html?id=${l.id}" class="btn btn-outline btn-sm" target="_blank">👁 View</a>
      <button class="btn btn-primary btn-sm" onclick="editListing('${l.id}')">✏️ Edit</button>
      ${l.status === 'approved' ? `<button class="btn btn-outline btn-sm" style="color:var(--gold); border-color:var(--gold);" onclick="featureAd('${l.id}', ${l.featured})">⭐ ${l.featured ? 'Renew' : 'Feature'} Ad (₹199/mo)</button>` : ''}
      <button class="btn btn-danger btn-sm" onclick="deleteListing('${l.id}')">🗑️ Delete</button>
    </div>
  </div>`;
}

function featureAd(id, isFeatured) {
  if (confirm(`You are about to be redirected to the payment gateway to pay ₹199 to ${isFeatured ? 'renew your featured status' : 'feature this ad'} for 1 month. Proceed?`)) {
    // Simulate successful payment and update locally
    Listings.update(id, { featured: true });
    showToast('Payment successful! Your ad is now featured.', 'success');
    renderMyListings();
  }
}

// ── EDIT ──
function editListing(id) {
  const listing = Listings.getById(id);
  if (!listing) return;
  editingListingId = id;
  existingPhotos   = listing.photos || [];
  pickedLat = listing.lat;
  pickedLng = listing.lng;

  const setVal = (elId, val) => { const el = document.getElementById(elId); if(el) el.value = val||''; };
  setVal('listing-title',         listing.title);
  setVal('listing-type',          listing.type);
  setVal('listing-city',          listing.city);
  setVal('listing-address',       listing.address);
  setVal('listing-desc',          listing.description);
  setVal('listing-floor',         listing.floor||'');
  setVal('listing-total-floors',  listing.totalFloors||'');
  setVal('listing-area',          listing.area||'');
  setVal('listing-occupants',     listing.maxOccupants||'');
  setVal('listing-furnish',       listing.furnishing||'');
  setVal('listing-tenants',       listing.preferredTenants||'any');
  setVal('listing-price-daily',   listing.priceDaily||'');
  setVal('listing-price-weekly',  listing.priceWeekly||'');
  setVal('listing-price-monthly', listing.priceMonthly||'');
  setVal('listing-deposit',       listing.deposit||'');
  setVal('listing-bills',         listing.bills||'excluded');
  setVal('listing-min-duration',  listing.minDuration||'monthly');

  // Desc count
  const descCount = document.getElementById('desc-count');
  if (descCount) descCount.textContent = (listing.description||'').length;

  // Amenities
  document.querySelectorAll('.amenity-check-input').forEach(cb => {
    cb.checked = (listing.amenities||[]).includes(cb.value);
    cb.closest('.amenity-check')?.classList.toggle('checked', cb.checked);
  });

  // Availability
  const toggle = document.getElementById('availability-toggle');
  if (toggle) {
    toggle.checked = listing.available !== false;
    const txt = document.getElementById('avail-text');
    if (txt) txt.textContent = toggle.checked ? 'Available Now' : 'Not Available';
  }

  renderPhotoPreview();
  showPanel('add');

  const heading = document.getElementById('add-form-heading');
  if (heading) heading.textContent = '✏️ Edit Listing — ' + listing.title.substring(0,30);

  setTimeout(() => initPickerMap(pickedLat, pickedLng, (lat, lng) => { pickedLat=lat; pickedLng=lng; }), 400);
}

// ── DELETE ──
function deleteListing(id) {
  if (!confirm('Permanently delete this listing? All related bookings and messages will also be removed.')) return;
  Listings.delete(id);
  showToast('Listing deleted.', 'success');
  renderMyListings();
}

// ── ADD PANEL INIT ──
function initAddListingPanel() {
  if (!editingListingId) {
    document.getElementById('add-listing-form')?.reset();
    photoFiles = []; existingPhotos = []; videoFile = null; pickedLat = null; pickedLng = null;
    const grid = document.getElementById('photo-preview-grid');
    if (grid) grid.innerHTML = '';
    const vid  = document.getElementById('video-preview');
    if (vid)  vid.innerHTML = '';
    const heading = document.getElementById('add-form-heading');
    if (heading) heading.textContent = '➕ Add New Listing';
    const avail = document.getElementById('avail-text');
    if (avail) avail.textContent = 'Available Now';
    const descCount = document.getElementById('desc-count');
    if (descCount) descCount.textContent = '0';
    // Reset amenity visuals
    document.querySelectorAll('.amenity-check').forEach(el => el.classList.remove('checked'));
    // Init map fresh
    setTimeout(() => initPickerMap(null, null, (lat, lng) => { pickedLat=lat; pickedLng=lng; }), 400);
  }
}

// ── PHOTO HANDLING ──
function handlePhotoFiles(files) {
  const maxPhotos = 10;
  const remaining = maxPhotos - existingPhotos.length - photoFiles.length;
  [...files].slice(0, remaining).forEach(file => {
    if (!file.type.startsWith('image/')) { showToast('Only image files allowed.', 'error'); return; }
    if (file.size > 5 * 1024 * 1024) { showToast(`${file.name} is too large (max 5MB).`, 'error'); return; }
    // Store the File object + a local preview URL
    photoFiles.push({ file, previewUrl: URL.createObjectURL(file), name: file.name });
  });
  renderPhotoPreview();
  if (files.length > remaining) showToast(`Max 10 photos allowed. Only first ${remaining} added.`, 'info');
}

function renderPhotoPreview() {
  const grid = document.getElementById('photo-preview-grid');
  if (!grid) return;
  grid.innerHTML = [
    ...existingPhotos.map((url, i) => `
      <div class="photo-preview-item">
        <img src="${sanitize(url)}" alt="Photo ${i+1}">
        <button class="remove-photo" onclick="removeExistingPhoto(${i})" title="Remove">✕</button>
        ${i===0 ? '<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(92,10,20,0.8);color:var(--gold);font-size:0.65rem;text-align:center;padding:2px;">COVER</div>' : ''}
      </div>`),
    ...photoFiles.map((f, i) => `
      <div class="photo-preview-item">
        <img src="${sanitize(f.previewUrl)}" alt="${sanitize(f.name)}">
        <button class="remove-photo" onclick="removeNewPhoto(${i})" title="Remove">✕</button>
      </div>`),
  ].join('');
}

function removeExistingPhoto(idx) { existingPhotos.splice(idx, 1); renderPhotoPreview(); }
function removeNewPhoto(idx)      { photoFiles.splice(idx, 1);     renderPhotoPreview(); }

// ── VIDEO HANDLING ──
function handleVideoFile(file) {
  if (!file) return;
  if (!file.type.startsWith('video/')) { showToast('Only video files allowed.', 'error'); return; }
  if (file.size > 100 * 1024 * 1024)  { showToast('Video too large (max 100MB).', 'error'); return; }
  const previewUrl = URL.createObjectURL(file);
  videoFile  = { file, previewUrl, name: file.name };
  const prev = document.getElementById('video-preview');
  if (prev) prev.innerHTML = `
    <video controls style="width:100%;max-height:220px;border-radius:8px;margin-top:12px;background:#000;">
      <source src="${sanitize(previewUrl)}" type="${file.type}">
    </video>
    <div style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:0.82rem;color:var(--gray-dk);">
      🎬 ${sanitize(file.name)} (${(file.size/1024/1024).toFixed(1)} MB)
      <button class="btn btn-danger btn-sm" onclick="removeVideo()">Remove</button>
    </div>`;
}
function removeVideo() {
  videoFile = null;
  const prev = document.getElementById('video-preview');
  if (prev) prev.innerHTML = '';
}

// ── FORM SUBMIT ──
async function handleListingSubmit(e) {
  e.preventDefault();

  const getVal = id => (document.getElementById(id)?.value || '').trim();
  const title    = getVal('listing-title');
  const type     = getVal('listing-type');
  const city     = getVal('listing-city');
  const address  = getVal('listing-address');
  const desc     = getVal('listing-desc');
  const floor    = Number(getVal('listing-floor')) || null;
  const totFloor = Number(getVal('listing-total-floors')) || null;
  const area     = Number(getVal('listing-area')) || null;
  const occupants= Number(getVal('listing-occupants')) || null;
  const furnish  = getVal('listing-furnish');
  const tenants  = getVal('listing-tenants') || 'any';
  const pDaily   = Number(getVal('listing-price-daily')) || null;
  const pWeekly  = Number(getVal('listing-price-weekly')) || null;
  const pMonthly = Number(getVal('listing-price-monthly')) || null;
  const deposit  = Number(getVal('listing-deposit')) || null;
  const bills    = getVal('listing-bills') || 'excluded';
  const minDur   = getVal('listing-min-duration') || 'monthly';
  const availFrom= getVal('listing-avail-from') || null;
  const avail    = document.getElementById('availability-toggle')?.checked !== false;

  // Validation
  const errors = [];
  if (!title)   errors.push('Property title');
  if (!type)    errors.push('Property type');
  if (!city)    errors.push('City');
  if (!address) errors.push('Address');
  if (!desc || desc.length < 20) errors.push('Description (min 20 chars)');
  if (!pDaily && !pWeekly && !pMonthly) errors.push('At least one price');
  if (!pickedLat || !pickedLng) errors.push('Map location (click on the map)');

  if (errors.length > 0) {
    showToast('Please fix: ' + errors.join(', '), 'error', 5000);
    return;
  }

  const amenities = [...document.querySelectorAll('.amenity-check-input:checked')].map(c => c.value);
  const session   = Auth.getSession();

  // ── Upload new photos to Supabase Storage ──
  let uploadedPhotos = [...existingPhotos]; // keep already-stored URLs
  if (photoFiles.length > 0) {
    showToast(`Uploading ${photoFiles.length} photo(s)…`, 'info', 15000);
    const folder = session.id;
    const results = await Promise.all(
      photoFiles.map(p => uploadToSupabase(p.file, SB_PHOTOS_BUCKET, folder))
    );
    const failed = results.filter(r => !r).length;
    if (failed > 0) showToast(`${failed} photo(s) failed to upload.`, 'error');
    uploadedPhotos = [...uploadedPhotos, ...results.filter(Boolean)];
  }

  // ── Upload video to Supabase Storage ──
  let videoUrl = null;
  if (videoFile && videoFile.file) {
    showToast('Uploading video…', 'info', 30000);
    videoUrl = await uploadToSupabase(videoFile.file, SB_VIDEOS_BUCKET, session.id);
    if (!videoUrl) showToast('Video upload failed. Listing will be saved without video.', 'error');
  }

  const data = {
    ownerId: session.id,
    title, type, city, address,
    description: desc,
    floor, totalFloors: totFloor, area, maxOccupants: occupants,
    furnishing: furnish, preferredTenants: tenants,
    priceDaily: pDaily, priceWeekly: pWeekly, priceMonthly: pMonthly,
    deposit, bills, minDuration: minDur,
    availableFrom: availFrom,
    amenities,
    photos: uploadedPhotos,
    video: videoUrl,
    lat: pickedLat, lng: pickedLng,
    available: avail,
  };

  if (editingListingId) {
    Listings.update(editingListingId, data);
    showToast('✅ Listing updated successfully!', 'success');
    editingListingId = null;
  } else {
    Listings.create(data);
    showToast('✅ Listing submitted for admin approval! Usually approved within 24 hours.', 'success', 5000);
  }

  // Reset state
  photoFiles = []; existingPhotos = []; videoFile = null; pickedLat = null; pickedLng = null;
  document.getElementById('add-listing-form')?.reset();
  const photoGrid = document.getElementById('photo-preview-grid');
  if (photoGrid) photoGrid.innerHTML = '';
  const videoPrev = document.getElementById('video-preview');
  if (videoPrev) videoPrev.innerHTML = '';
  const descCnt = document.getElementById('desc-count');
  if (descCnt) descCnt.textContent = '0';
  document.querySelectorAll('.amenity-check').forEach(el => el.classList.remove('checked'));
  showPanel('listings');
}

// ── INQUIRIES ──
function renderInquiries() {
  const session   = Auth.getSession();
  const inbox     = Messages.getOwnerInbox(session.id);
  const container = document.getElementById('inquiries-container');
  if (!container) return;

  Messages.markRead(null, null, session.id); // mark all as read visually
  updateInquiryBadge();

  if (inbox.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">💬</span><h3>No inquiries yet</h3><p>When renters message you, they'll appear here.</p></div>`;
    return;
  }

  container.innerHTML = inbox.map(msg => {
    const listing = Listings.getById(msg.listingId);
    const renter  = Auth.getUserById(msg.renterId) || { name: msg.senderName || 'Renter' };
    const unread  = !msg.read && msg.sender === 'renter';
    return `
    <div class="inquiry-card ${unread ? 'unread' : ''}" onclick="openConversation('${msg.listingId}','${msg.renterId}')" style="cursor:pointer;">
      <div class="inquiry-header">
        <h4>
          ${unread ? '<span style="display:inline-block;width:8px;height:8px;background:var(--burgundy);border-radius:50%;margin-right:6px;vertical-align:middle;"></span>' : ''}
          👤 ${sanitize(renter.name)}
          <span style="color:var(--gray-mid);font-size:0.82rem;font-weight:400;margin-left:8px;">re: ${sanitize((listing?.title||'Listing').substring(0,35))}</span>
        </h4>
        <span class="time">${fmtTime(msg.createdAt)}</span>
      </div>
      <div class="inquiry-meta">
        ${listing ? `<span class="badge ${getCategoryBadge(listing.type)}" style="font-size:0.7rem;">${getCategoryLabel(listing.type)}</span>` : ''}
        📍 ${sanitize(listing?.city||'')}
      </div>
      <div class="inquiry-preview" style="margin-top:8px;">
        ${msg.sender==='renter'?'💬':'↩️'} "${sanitize((msg.text||'').substring(0,100))}${msg.text?.length>100?'…':''}"
      </div>
    </div>`;
  }).join('');
}

function updateInquiryBadge() {
  const session = Auth.getSession();
  if (!session) return;
  const count = Messages.countUnread(session.id);
  const badge = document.getElementById('inquiry-badge');
  if (badge) {
    badge.textContent = count > 0 ? count : '';
    badge.style.display = count > 0 ? 'inline' : 'none';
  }
}

// ── CONVERSATION MODAL ──
function openConversation(listingId, renterId) {
  const msgs    = Messages.getConversation(listingId, renterId).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  const renter  = Auth.getUserById(renterId) || { name: 'Renter' };
  const listing = Listings.getById(listingId);
  const session = Auth.getSession();

  Messages.markRead(listingId, renterId);
  updateInquiryBadge();

  const title  = document.getElementById('conv-modal-title');
  const thread = document.getElementById('conv-thread');
  const input  = document.getElementById('conv-input');

  if (title) title.textContent = `💬 ${renter.name} — ${(listing?.title||'').substring(0,30)}`;

  if (thread) {
    thread.innerHTML = msgs.length === 0
      ? '<div style="text-align:center;padding:24px;color:var(--gray-mid);">Start the conversation!</div>'
      : msgs.map(m => `
          <div class="message-bubble ${m.sender==='owner'?'sent':'received'}">
            ${sanitize(m.text)}
            <div class="message-time">${fmtTime(m.createdAt)}</div>
          </div>`).join('');
    thread.scrollTop = thread.scrollHeight;
  }

  // Renter contact info card
  const infoArea = document.getElementById('conv-renter-info');
  if (infoArea) {
    const r = Auth.getUserById(renterId) || {};
    infoArea.innerHTML = r.phone ? `<div style="font-size:0.82rem;color:var(--gray-dk);margin-bottom:12px;padding:10px;background:var(--ivory-dk);border-radius:8px;">📞 ${sanitize(r.phone)} &nbsp;·&nbsp; ✉️ ${sanitize(r.email||'')}</div>` : '';
  }

  // Attach send handler (clone to remove old listeners)
  const sendBtn = document.getElementById('conv-send');
  const newSend = sendBtn.cloneNode(true);
  sendBtn.parentNode.replaceChild(newSend, sendBtn);

  const doSend = () => {
    const text = (input?.value||'').trim();
    if (!text) return;
    Messages.send({ listingId, ownerId: session.id, renterId, sender: 'owner', senderName: session.name, text });
    if (input) input.value = '';
    openConversation(listingId, renterId); // re-render
  };

  newSend.addEventListener('click', doSend);
  input?.addEventListener('keydown', e => { if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });

  openModal('conv-modal');
}

// ── BOOKINGS ──
function renderOwnerBookings() {
  const session   = Auth.getSession();
  const bookings  = Bookings.getByOwner(session.id);
  const container = document.getElementById('owner-bookings-container');
  if (!container) return;

  if (bookings.length === 0) {
    container.innerHTML = `<div class="empty-state"><span class="empty-icon">📅</span><h3>No booking requests yet</h3><p>When renters request bookings, they'll appear here for you to approve.</p></div>`;
    return;
  }

  const byStatus = (arr, s) => arr.filter(b=>b.status===s);
  const pending  = byStatus(bookings, 'pending');
  const approved = byStatus(bookings, 'approved');
  const rejected = byStatus(bookings, 'rejected');

  const renderGroup = (label, items, color) => items.length === 0 ? '' : `
    <h3 style="color:${color};font-size:1rem;margin:20px 0 12px;display:flex;align-items:center;gap:8px;">
      ${label} <span class="badge" style="background:${color};color:white;">${items.length}</span>
    </h3>
    ${items.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(b => `
      <div class="booking-card">
        <div class="booking-info">
          <h4>${sanitize(b.listingTitle)}</h4>
          <p>👤 <strong>${sanitize(b.renterName)}</strong> &nbsp;·&nbsp; 📞 ${sanitize(b.renterPhone||'N/A')} &nbsp;·&nbsp; ✉️ ${sanitize(b.renterEmail)}</p>
          <p>📅 ${sanitize(b.startDate)} → ${sanitize(b.endDate)} &nbsp;·&nbsp; <strong>${sanitize(b.duration)}</strong></p>
          <p>💰 <strong>₹${Number(b.totalPrice).toLocaleString('en-IN')}</strong> &nbsp;·&nbsp; Requested: ${fmt(b.createdAt)}</p>
          ${b.message ? `<p style="font-style:italic;font-size:0.83rem;color:var(--gray-dk);margin-top:4px;">💬 "${sanitize(b.message)}"</p>` : ''}
        </div>
        <div class="booking-actions">
          ${b.status==='pending' ? `
            <button class="btn btn-success btn-sm" onclick="updateBookingStatus('${b.id}','approved')">✓ Approve</button>
            <button class="btn btn-danger btn-sm"  onclick="updateBookingStatus('${b.id}','rejected')">✕ Reject</button>` : ''}
          ${b.status!=='pending' ? `<span class="badge badge-${b.status==='approved'?'available':'occupied'}" style="padding:8px 14px;">${b.status}</span>` : ''}
        </div>
      </div>`).join('')}`;

  container.innerHTML =
    renderGroup('⏳ Pending Approval', pending, '#f39c12') +
    renderGroup('✅ Approved', approved, '#27ae60') +
    renderGroup('❌ Rejected', rejected, '#c0392b');
}

function updateBookingStatus(id, status) {
  Bookings.updateStatus(id, status);
  showToast(`Booking ${status === 'approved' ? '✅ approved!' : '❌ rejected.'}`, status==='approved'?'success':'info');
  renderOwnerBookings();
}

// ── MODAL HELPERS ──
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});
