/* ============================================================
   2nd Home — app.js
   Core LocalStorage database, auth, seed data, utilities
   ============================================================ */

'use strict';

/// ═══════════════════════════════════════
// DB KEYS
// ═══════════════════════════════════════
const DB = {
  USERS:    're_users',
  OWNERS:   're_owners',
  LISTINGS: 're_listings',
  BOOKINGS: 're_bookings',
  MESSAGES: 're_messages',
  SESSION:  're_session',
};

// ═══════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════
const getDB   = key => JSON.parse(localStorage.getItem(key) || '[]');
const setDB   = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error('LocalStorage error:', e);
    if (e.name === 'QuotaExceededError') {
      alert('Local storage is full! The file you uploaded might be too large for this demo. Try uploading a smaller image or clearing data.');
    }
  }
};
const genId   = () => '_' + Math.random().toString(36).substr(2, 9);
const now     = () => new Date().toISOString();
const fmt     = (iso) => new Date(iso).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
const fmtTime = (iso) => new Date(iso).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });

const sanitize = str => {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
};

// ═══════════════════════════════════════
// FIREBASE CLOUD SYNC (Optimistic UI)
// ═══════════════════════════════════════
// Writes go to LocalStorage AND Firestore.
// Reads come from LocalStorage instantly.
// Firestore onSnapshot updates LocalStorage in the background.

function cloudSet(collection, id, data) {
  if (window.db) {
    window.db.collection(collection).doc(id).set(data).catch(err => {
      console.warn(`[Cloud sync] Could not save ${collection}/${id}; local data is retained.`, err.message);
    });
  }
}

function cloudDelete(collection, id) {
  // Track locally to prevent Firebase from re-syncing undeleted demo items
  const deletedIds = JSON.parse(localStorage.getItem('re_deleted_ids') || '[]');
  if (!deletedIds.includes(id)) {
    deletedIds.push(id);
    localStorage.setItem('re_deleted_ids', JSON.stringify(deletedIds));
  }

  if (window.db) {
    window.db.collection(collection).doc(id).delete().catch(err => {
      console.warn(`[Cloud sync] Could not delete ${collection}/${id}; local data is retained.`, err.message);
    });
  }
}

// Attach real-time listeners to sync cloud data down to local storage
document.addEventListener('DOMContentLoaded', () => {
  if (window.db) {
    const syncCollection = (name, localKey) => {
      window.db.collection(name).onSnapshot(snap => {
        let list = snap.docs.map(doc => doc.data());
        
        // Filter out items that were deleted locally
        const deletedIds = JSON.parse(localStorage.getItem('re_deleted_ids') || '[]');
        if (deletedIds.length > 0) {
          list = list.filter(item => !deletedIds.includes(item.id));
        }
        
        setDB(localKey, list);
        // Dispatch event so UI can auto-refresh if it wants
        window.dispatchEvent(new CustomEvent('cloud_update'));
      }, err => {
        console.warn(`[Cloud sync] ${name} is unavailable; using local data.`, err.message);
      });
    };
    syncCollection('users', DB.USERS);
    syncCollection('owners', DB.OWNERS);
    syncCollection('listings', DB.LISTINGS);
    syncCollection('bookings', DB.BOOKINGS);
    syncCollection('messages', DB.MESSAGES);
  }
});

window.addEventListener('cloud_update', () => {
  // Auto-refresh data on screen if the render functions exist
  if (typeof renderMyListings === 'function') renderMyListings();
  if (typeof applyFilters === 'function') {
    const oldHtml = document.getElementById('listings-grid')?.innerHTML;
    applyFilters(); 
  }
});

// ═══════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════
function showToast(msg, type = 'info', duration = 3500) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `<strong>${icon}</strong>  ${sanitize(msg)}`;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ═══════════════════════════════════════
// AUTHENTICATION (Real Firebase Auth)
// ═══════════════════════════════════════
const Auth = {
  ADMIN_EMAIL:    'praveshchettri05@gmail.com',

  // Get current user session from LocalStorage
  getSession() { return JSON.parse(localStorage.getItem(DB.SESSION) || 'null'); },
  isLoggedIn() { return !!this.getSession(); },
  isAdmin()    { const s = this.getSession(); return s && s.role === 'admin'; },

  requireAuth(role) {
    const s = this.getSession();
    if (!s || (role && s.role !== role)) { window.location.href = 'auth.html'; return false; }
    return true;
  },

  getUserById(id)  { return getDB(DB.USERS).find(u => u.id === id) || null; },
  getOwnerById(id) { return getDB(DB.OWNERS).find(o => o.id === id) || null; },

  async login(email, password, role) {
    if (role === 'admin') {
      if (email.toLowerCase() === this.ADMIN_EMAIL.toLowerCase()) {
        try {
          if (!window.auth) throw new Error("Firebase not initialized");
          await window.auth.signInWithEmailAndPassword(email, password);
          const session = { id: 'admin', name: 'System Admin', email, role: 'admin' };
          setDB(DB.SESSION, session);
          return { ok: true };
        } catch (err) {
          return { ok: false, msg: err.message };
        }
      }
      return { ok: false, msg: 'Access Denied: Only the site owner can access this portal.' };
    }

    const normalizedEmail = email.trim().toLowerCase();
    const localAccounts = [
      ...getDB(DB.OWNERS).map(user => ({ ...user, accountRole: 'owner' })),
      ...getDB(DB.USERS).map(user => ({ ...user, accountRole: 'renter' })),
    ];
    const localAccount = localAccounts.find(user =>
      String(user.email || '').toLowerCase() === normalizedEmail &&
      user.password === password
    );

    // Demo/local accounts must remain usable when Firebase Email/Password
    // authentication is disabled or unavailable in a deployment.
    if (localAccount) {
      if (localAccount.status === 'suspended') {
        return { ok: false, msg: 'Account suspended' };
      }
      const session = {
        id: localAccount.id,
        name: localAccount.name,
        email: localAccount.email,
        role: localAccount.accountRole,
      };
      setDB(DB.SESSION, session);
      return { ok: true, user: localAccount };
    }

    try {
      if (!window.auth) throw new Error("Firebase not initialized");
      const cred = await window.auth.signInWithEmailAndPassword(normalizedEmail, password);
      return await this.handleProviderLogin(cred.user, role, { loginMethod: 'email' });
    } catch (err) {
      const accountWithEmail = localAccounts.find(user =>
        String(user.email || '').toLowerCase() === normalizedEmail
      );
      if (accountWithEmail && accountWithEmail.accountRole !== role) {
        return {
          ok: false,
          msg: `This account is registered as a ${accountWithEmail.accountRole}. Select that role and try again.`,
        };
      }
      if (err.code === 'auth/operation-not-allowed') {
        return { ok: false, msg: 'Email/password login is not enabled yet. Please enable it in Firebase Authentication.' };
      }
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        return { ok: false, msg: 'Incorrect email or password.' };
      }
      return { ok: false, msg: err.message || 'Unable to sign in.' };
    }
  },

  async registerRenter(data) {
    try {
      if (!window.auth) throw new Error("Firebase not initialized");
      const cred = await window.auth.createUserWithEmailAndPassword(data.email, data.password);
      return await this.handleProviderLogin(cred.user, 'renter', data);
    } catch (err) {
      return { ok: false, msg: err.message };
    }
  },

  async registerOwner(data) {
    try {
      if (!window.auth) throw new Error("Firebase not initialized");
      const cred = await window.auth.createUserWithEmailAndPassword(data.email, data.password);
      return await this.handleProviderLogin(cred.user, 'owner', data);
    } catch (err) {
      return { ok: false, msg: err.message };
    }
  },

  async handleProviderLogin(firebaseUser, role, extraData = {}) {
    // Wait a tiny bit for cloud sync if necessary
    await new Promise(r => setTimeout(r, 800));
    const list = getDB(role === 'owner' ? DB.OWNERS : DB.USERS);
    let user = list.find(u => u.id === firebaseUser.uid || u.email === firebaseUser.email);

    if (!user) {
      // Create new user profile in Firestore
      user = {
        id: firebaseUser.uid,
        name: extraData.name || firebaseUser.displayName || 'User',
        email: firebaseUser.email || extraData.email || '',
        phone: firebaseUser.phoneNumber || extraData.phone || '',
        role: role,
        status: 'active',
        createdAt: now(),
        lat: extraData.lat || null,
        lng: extraData.lng || null,
        address: extraData.address || ''
      };
      if (role === 'renter') user.favorites = [];
      if (role === 'owner') user.verified = false;

      list.push(user);
      setDB(role === 'owner' ? DB.OWNERS : DB.USERS, list);
      cloudSet(role === 'owner' ? 'owners' : 'users', user.id, user);
    } else {
      if (user.status === 'suspended') {
        window.auth.signOut();
        return { ok: false, msg: 'Account suspended' };
      }
    }

    const session = { id: user.id, name: user.name, email: user.email, role };
    setDB(DB.SESSION, session);
    return { ok: true, user };
  },

  async logout() {
    if (window.auth) await window.auth.signOut();
    localStorage.removeItem(DB.SESSION);
    window.location.href = 'auth.html';
  }
};

// ═══════════════════════════════════════
// LISTINGS DB
// ═══════════════════════════════════════
const Listings = {
  getAll()      { return getDB(DB.LISTINGS); },
  getApproved() { return this.getAll().filter(l => l.status === 'approved'); },
  getFeatured() { return this.getApproved().filter(l => l.featured); },
  getById(id)   { return this.getAll().find(l => l.id === id) || null; },
  getByOwner(id){ return this.getAll().filter(l => l.ownerId === id); },

  create(data) {
    const list = getDB(DB.LISTINGS);
    const listing = {
      id: genId(),
      ...data,
      status: 'pending',
      featured: false,
      views: 0,
      createdAt: now(),
    };
    list.push(listing);
    setDB(DB.LISTINGS, list);
    cloudSet('listings', listing.id, listing);
    return listing;
  },

  update(id, data) {
    const list = getDB(DB.LISTINGS);
    const idx  = list.findIndex(l => l.id === id);
    if (idx === -1) return false;
    list[idx] = { ...list[idx], ...data, updatedAt: now() };
    setDB(DB.LISTINGS, list);
    cloudSet('listings', id, list[idx]);
    return true;
  },

  delete(id) {
    let list = getDB(DB.LISTINGS);
    list = list.filter(l => l.id !== id);
    setDB(DB.LISTINGS, list);
    cloudDelete('listings', id);
  },
  
  incrementViews(id) {
    const list = getDB(DB.LISTINGS);
    const item = list.find(l => l.id === id);
    if (item) {
      item.views = (item.views || 0) + 1;
      setDB(DB.LISTINGS, list);
      cloudSet('listings', id, item);
    }
  }
};

// ═══════════════════════════════════════
// BOOKINGS DB
// ═══════════════════════════════════════
const Bookings = {
  getAll()   { return getDB(DB.BOOKINGS); },
  getById(id){ return this.getAll().find(b => b.id === id) || null; },
  getByRenter(renterId)  { return this.getAll().filter(b => b.renterId === renterId); },
  getByOwner(ownerId)    { return this.getAll().filter(b => b.ownerId  === ownerId); },
  getByListing(listingId){ return this.getAll().filter(b => b.listingId === listingId); },

  create(data) {
    const list = getDB(DB.BOOKINGS);
    const booking = {
      id: genId(),
      ...data,
      status: 'pending',
      createdAt: now(),
    };
    list.push(booking);
    setDB(DB.BOOKINGS, list);
    cloudSet('bookings', booking.id, booking);
    return booking;
  },

  updateStatus(id, status) {
    const list = getDB(DB.BOOKINGS);
    const idx  = list.findIndex(b => b.id === id);
    if (idx === -1) return false;
    list[idx].status = status;
    list[idx].updatedAt = now();
    setDB(DB.BOOKINGS, list);
    cloudSet('bookings', id, list[idx]);
    return true;
  },
};

// ═══════════════════════════════════════
// MESSAGES DB
// ═══════════════════════════════════════
const Messages = {
  getAll()   { return getDB(DB.MESSAGES); },

  getConversation(listingId, renterId) {
    return this.getAll().filter(m => m.listingId === listingId && m.renterId === renterId);
  },

  getOwnerInbox(ownerId) {
    // Return grouped by (listingId + renterId), latest message first
    const msgs = this.getAll().filter(m => m.ownerId === ownerId);
    const groups = {};
    msgs.forEach(m => {
      const key = `${m.listingId}_${m.renterId}`;
      if (!groups[key] || new Date(m.createdAt) > new Date(groups[key].createdAt)) {
        groups[key] = m;
      }
    });
    return Object.values(groups).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  getRenterInbox(renterId) {
    const msgs = this.getAll().filter(m => m.renterId === renterId);
    const groups = {};
    msgs.forEach(m => {
      const key = `${m.listingId}`;
      if (!groups[key] || new Date(m.createdAt) > new Date(groups[key].createdAt)) {
        groups[key] = m;
      }
    });
    return Object.values(groups).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  send(data) {
    const list = getDB(DB.MESSAGES);
    const msg  = { id: genId(), ...data, createdAt: now(), read: false };
    list.push(msg);
    setDB(DB.MESSAGES, list);
    cloudSet('messages', msg.id, msg);
    return msg;
  },

  markRead(listingId, renterId, ownerId) {
    // If ownerId is passed alone (null, null, ownerId) — mark all for that owner
    const list = getDB(DB.MESSAGES).map(m => {
      if (ownerId && !listingId) {
        if (m.ownerId === ownerId && m.sender === 'renter') { m.read = true; cloudSet('messages', m.id, m); }
      } else if (m.listingId === listingId && m.renterId === renterId) {
        m.read = true; cloudSet('messages', m.id, m);
      }
      return m;
    });
    setDB(DB.MESSAGES, list);
  },

  countUnread(ownerId) {
    return this.getAll().filter(m => m.ownerId === ownerId && !m.read && m.sender === 'renter').length;
  },
};

// ═══════════════════════════════════════
// FAVORITES
// ═══════════════════════════════════════
const Favorites = {
  getAll(userId) {
    const users = getDB(DB.USERS);
    const u = users.find(u => u.id === userId);
    return u ? (u.favorites || []) : [];
  },
  toggle(userId, listingId) {
    const users = getDB(DB.USERS);
    const idx   = users.findIndex(u => u.id === userId);
    if (idx === -1) return false;
    const favs = users[idx].favorites || [];
    const pos  = favs.indexOf(listingId);
    if (pos === -1) favs.push(listingId);
    else            favs.splice(pos, 1);
    users[idx].favorites = favs;
    setDB(DB.USERS, users);
    return pos === -1; // true = added, false = removed
  },
  isFav(userId, listingId) {
    return this.getAll(userId).includes(listingId);
  },
};

// ═══════════════════════════════════════
// CATEGORY CONFIG
// ═══════════════════════════════════════
const CATEGORIES = {
  shop:    { label: 'Commercial Shop',       icon: '🏪', badge: 'badge-shop'   },
  living:  { label: 'Living Apartment',      icon: '🏠', badge: 'badge-living' },
  pg:      { label: 'Paying Guest (w/ Food)',icon: '🍽️', badge: 'badge-pg'    },
  room:    { label: 'Single Room',           icon: '🛏️', badge: 'badge-room'  },
  garage:  { label: 'Garage / Parking',      icon: '🚗', badge: 'badge-garage' },
};

function getCategoryLabel(type) { return CATEGORIES[type]?.label || type; }
function getCategoryIcon(type)  { return CATEGORIES[type]?.icon  || '🏠'; }
function getCategoryBadge(type) { return CATEGORIES[type]?.badge || 'badge-room'; }

// ═══════════════════════════════════════
// NAVBAR SCROLL + MOBILE
// ═══════════════════════════════════════
function initNavbar() {
  const navbar = document.querySelector('.navbar');
  if (!navbar) return;

  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
  });

  const hamburger = document.querySelector('.nav-hamburger');
  const navLinks  = document.querySelector('.nav-links');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => navLinks.classList.toggle('open'));
    document.addEventListener('click', e => {
      if (!navbar.contains(e.target)) navLinks.classList.remove('open');
    });
  }

  // Highlight active nav
  const currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === currentPage) a.classList.add('active');
  });

  // Auth state in nav
  const session = Auth.getSession();
  const navAuthArea = document.getElementById('nav-auth');
  if (navAuthArea && session) {
    navAuthArea.innerHTML = `
      <a href="${session.role}-dashboard.html" class="btn-nav-cta" style="color:var(--burgundy-dk)!important">
        👤 ${session.name.split(' ')[0]}
      </a>
      <a href="#" onclick="Auth.logout();return false;" style="color:rgba(255,255,255,0.6);padding:8px 12px;font-size:0.82rem;">Logout</a>`;
  }
}

// ═══════════════════════════════════════
// SCROLL-TO-TOP
// ═══════════════════════════════════════
function initScrollTop() {
  const btn = document.querySelector('.scroll-top');
  if (!btn) return;
  window.addEventListener('scroll', () => btn.classList.toggle('visible', window.scrollY > 300));
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ═══════════════════════════════════════
// SEED DEMO DATA (runs once)
// ═══════════════════════════════════════
function seedDemoData() {
  if (localStorage.getItem('re_seeded')) return;

  // Demo owners
  const owners = [
    { id:'o1', name:'Rajesh Sharma', email:'rajesh@demo.com', password:'owner123', phone:'9876543210', city:'Bangalore', role:'owner', createdAt:now(), status:'active', verified:true,  lat:12.9352, lng:77.6245, address:'Koramangala, Bangalore' },
    { id:'o2', name:'Priya Patel',   email:'priya@demo.com',  password:'owner123', phone:'9812345678', city:'Delhi',     role:'owner', createdAt:now(), status:'active', verified:true,  lat:28.5672, lng:77.2100, address:'South Delhi' },
    { id:'o3', name:'Suresh Kumar',  email:'suresh@demo.com', password:'owner123', phone:'9898765432', city:'Mumbai',    role:'owner', createdAt:now(), status:'active', verified:false, lat:19.1176, lng:72.9060, address:'Powai, Mumbai' },
    { id:'o4', name:'Anita Joshi',   email:'anita@demo.com',  password:'owner123', phone:'9845678901', city:'Pune',      role:'owner', createdAt:now(), status:'active', verified:true,  lat:18.5204, lng:73.8567, address:'Hinjewadi, Pune' },
  ];
  setDB(DB.OWNERS, owners);
  owners.forEach(o => cloudSet('owners', o.id, o));

  // Demo renters
  const users = [
    { id:'u1', name:'Amit Singh',  email:'amit@demo.com',  password:'renter123', phone:'9900112233', role:'renter', createdAt:now(), status:'active', favorites:['l1','l3'], lat:12.9716, lng:77.5946, address:'Indiranagar, Bangalore' },
    { id:'u2', name:'Neha Verma',  email:'neha@demo.com',  password:'renter123', phone:'9911223344', role:'renter', createdAt:now(), status:'active', favorites:[], lat:19.0760, lng:72.8777, address:'Bandra, Mumbai' },
  ];
  setDB(DB.USERS, users);
  users.forEach(u => cloudSet('users', u.id, u));

  const listings = [
    {
      id:'l1', ownerId:'o1',
      title:'Spacious 2BHK Apartment in Koramangala',
      type:'living', city:'Bangalore', address:'12th Cross, Koramangala, Bangalore',
      description:'A well-furnished 2BHK apartment with modular kitchen, 24/7 water supply, and power backup. Ideal for working professionals and families. Close to metro and IT parks. Society has gym, CCTV, and covered parking.',
      floor:3, totalFloors:8, area:950, maxOccupants:4, furnishing:'fully-furnished', preferredTenants:'professionals',
      priceDaily:1500, priceWeekly:8000, priceMonthly:22000, deposit:44000, bills:'excluded',
      amenities:['WiFi','AC','Parking','Geyser','Furnished','Power Backup','CCTV','Gym','Lift'],
      photos:['https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80','https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800&q=80','https://images.unsplash.com/photo-1556020685-ae41abfc9365?w=800&q=80','https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80'],
      video:null, lat:12.9352, lng:77.6245, status:'approved', featured:true, available:true, createdAt:now(), views:142,
    },
    {
      id:'l2', ownerId:'o4',
      title:'PG with Home-cooked Meals — Hinjewadi, Pune',
      type:'pg', city:'Pune', address:'Phase 2, Hinjewadi IT Park, Pune',
      description:'Comfortable PG accommodation with nutritious home-cooked breakfast and dinner. Separate wings for gents and ladies. TV lounge, fast WiFi, and laundry included. Shuttle to IT park available.',
      floor:1, totalFloors:3, area:180, maxOccupants:2, furnishing:'fully-furnished', preferredTenants:'professionals',
      priceDaily:null, priceWeekly:null, priceMonthly:8500, deposit:8500, bills:'all',
      amenities:['WiFi','Food (2 Meals)','Laundry','CCTV','RO Water','Attached Bath'],
      photos:['https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=800&q=80','https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=800&q=80'],
      video:null, lat:18.5912, lng:73.7389, status:'approved', featured:true, available:true, createdAt:now(), views:89,
    },
    {
      id:'l3', ownerId:'o2',
      title:'Prime Commercial Shop — Brigade Road, Bangalore',
      type:'shop', city:'Bangalore', address:'Brigade Road, MG Road Area, Bangalore',
      description:'Prime ground-floor commercial shop, 400 sq ft, in the heart of Brigade Road. High foot traffic. Suitable for retail, salon, boutique, or food stall. All amenities included.',
      floor:0, totalFloors:5, area:400, maxOccupants:6, furnishing:'unfurnished', preferredTenants:'any',
      priceDaily:null, priceWeekly:15000, priceMonthly:45000, deposit:90000, bills:'electricity',
      amenities:['24/7 Access','Power','CCTV','Parking nearby'],
      photos:['https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=800&q=80','https://images.unsplash.com/photo-1604594849809-dfedbc827105?w=800&q=80'],
      video:null, lat:12.9758, lng:77.6073, status:'approved', featured:false, available:true, createdAt:now(), views:213,
    },
    {
      id:'l4', ownerId:'o2',
      title:'Furnished Single Room near Metro — South Delhi',
      type:'room', city:'Delhi', address:'South Extension Part 1, New Delhi',
      description:'Clean furnished single room with attached bathroom. All bills included. Walking distance to Lajpat Nagar metro. Suitable for students and working professionals. No brokerage.',
      floor:2, totalFloors:4, area:180, maxOccupants:1, furnishing:'semi-furnished', preferredTenants:'any',
      priceDaily:600, priceWeekly:3500, priceMonthly:9000, deposit:9000, bills:'all',
      amenities:['WiFi','Attached Bath','Bills Included','Furnished','Metro Nearby'],
      photos:['https://images.unsplash.com/photo-1631679706909-1844bbd07221?w=800&q=80','https://images.unsplash.com/photo-1594026112284-02bb6f3352fe?w=800&q=80'],
      video:null, lat:28.5672, lng:77.2100, status:'approved', featured:false, available:true, createdAt:now(), views:56,
    },
    {
      id:'l5', ownerId:'o3',
      title:'Covered Garage for Cars & Bikes — Powai, Mumbai',
      type:'garage', city:'Mumbai', address:'Hiranandani Gardens, Powai, Mumbai',
      description:'Covered, secured garage for 2 cars or 4 bikes. 24/7 CCTV-monitored with key-card access control. Monthly & long-term plans available. Fire safety equipped.',
      floor:null, totalFloors:null, area:320, maxOccupants:null, furnishing:null, preferredTenants:'any',
      priceDaily:200, priceWeekly:1200, priceMonthly:3500, deposit:3500, bills:'electricity',
      amenities:['CCTV','Access Control','24/7 Access','Fire Safety','Covered Parking'],
      photos:['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80','https://images.unsplash.com/photo-1593787406369-bd08891a2d44?w=800&q=80'],
      video:null, lat:19.1176, lng:72.9060, status:'approved', featured:false, available:true, createdAt:now(), views:34,
    },
    {
      id:'l6', ownerId:'o3',
      title:'Studio Apartment with Gym & Pool — Whitefield, Bangalore',
      type:'living', city:'Bangalore', address:'Whitefield Main Road, near ITPL Tech Park',
      description:'Cozy studio apartment perfect for singles. Modular kitchen, AC, high-speed internet. 5 min walk to ITPL. Society offers gym and swimming pool. Great views from balcony.',
      floor:7, totalFloors:15, area:520, maxOccupants:2, furnishing:'fully-furnished', preferredTenants:'professionals',
      priceDaily:1200, priceWeekly:7000, priceMonthly:18000, deposit:36000, bills:'excluded',
      amenities:['WiFi','AC','Gym','Pool','Modular Kitchen','Lift','CCTV','Power Backup'],
      photos:['https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80','https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80'],
      video:null, lat:12.9698, lng:77.7500, status:'pending', featured:false, available:true, createdAt:now(), views:0,
    },
    {
      id:'l7', ownerId:'o1',
      title:'Ladies PG with Food — Indiranagar, Bangalore',
      type:'pg', city:'Bangalore', address:'100 Feet Road, Indiranagar, Bangalore',
      description:'Safe, ladies-only PG accommodation with 3 nutritious meals per day. CCTV security, strict visitor policy, warden on premises. Close to metro station. Double and single rooms available.',
      floor:1, totalFloors:3, area:150, maxOccupants:2, furnishing:'fully-furnished', preferredTenants:'ladies',
      priceDaily:null, priceWeekly:null, priceMonthly:10500, deposit:10500, bills:'all',
      amenities:['WiFi','Food (2 Meals)','Laundry','CCTV','RO Water','Geyser','Metro Nearby'],
      photos:['https://images.unsplash.com/photo-1555854877-bab0e564b8d5?w=800&q=80'],
      video:null, lat:12.9784, lng:77.6408, status:'approved', featured:false, available:true, createdAt:now(), views:67,
    },
    {
      id:'l8', ownerId:'o4',
      title:'Office Space for Rent — Baner, Pune',
      type:'shop', city:'Pune', address:'Baner Road, Near Balewadi, Pune',
      description:'1200 sq ft air-conditioned office space with 15 workstations, conference room, and pantry. High-speed internet, 24/7 access, security guard, ample parking.',
      floor:4, totalFloors:8, area:1200, maxOccupants:20, furnishing:'semi-furnished', preferredTenants:'any',
      priceDaily:null, priceWeekly:null, priceMonthly:55000, deposit:110000, bills:'excluded',
      amenities:['WiFi','AC','Parking','Lift','CCTV','24/7 Access','Power Backup'],
      photos:['https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=800&q=80','https://images.unsplash.com/photo-1604594849809-dfedbc827105?w=800&q=80'],
      video:null, lat:18.5590, lng:73.7868, status:'approved', featured:true, available:true, createdAt:now(), views:44,
    },
  ];
  setDB(DB.LISTINGS, listings);
  listings.forEach(l => cloudSet('listings', l.id, l));

  const msgs = [
    { id:'m1', listingId:'l1', ownerId:'o1', renterId:'u1', sender:'renter', senderName:'Amit Singh',   text:'Hi, is the apartment still available next month? I am very interested.', createdAt:now(), read:false },
    { id:'m2', listingId:'l1', ownerId:'o1', renterId:'u1', sender:'owner',  senderName:'Rajesh Sharma', text:'Yes it is available! What is your preferred move-in date?', createdAt:now(), read:true  },
    { id:'m3', listingId:'l3', ownerId:'o2', renterId:'u2', sender:'renter', senderName:'Neha Verma',    text:'Is the shop space negotiable? Looking for 6 month lease.', createdAt:now(), read:false },
  ];
  setDB(DB.MESSAGES, msgs);
  msgs.forEach(m => cloudSet('messages', m.id, m));

  const bookings = [
    {
      id:'b1', listingId:'l1', ownerId:'o1', renterId:'u1',
      renterName:'Amit Singh', renterEmail:'amit@demo.com', renterPhone:'9900112233',
      listingTitle:'Spacious 2BHK Apartment in Koramangala',
      duration:'monthly', startDate:'2026-10-01', endDate:'2026-10-31',
      totalPrice:22000, status:'pending', message:'Looking for 1 month initially, may extend.', createdAt:now(),
    },
    {
      id:'b2', listingId:'l2', ownerId:'o4', renterId:'u2',
      renterName:'Neha Verma', renterEmail:'neha@demo.com', renterPhone:'9911223344',
      listingTitle:'PG with Home-cooked Meals — Hinjewadi, Pune',
      duration:'monthly', startDate:'2026-10-01', endDate:'2026-12-31',
      totalPrice:25500, status:'approved', message:'', createdAt:now(),
    },
  ];
  setDB(DB.BOOKINGS, bookings);
  bookings.forEach(b => cloudSet('bookings', b.id, b));

  localStorage.setItem('re_seeded', '1');
}

// Admin helper: reset all data
function resetAllData() {
  if (!confirm('⚠️ This will delete ALL data including listings, users, bookings, and messages. Continue?')) return;
  Object.values(DB).forEach(key => localStorage.removeItem(key));
  localStorage.removeItem('re_seeded');
  localStorage.removeItem('re_deleted_ids');
  showToast('All data reset. Page will reload…', 'info');
  setTimeout(() => location.reload(), 1500);
}




// ═══════════════════════════════════════
// LISTING CARD HTML
// ═══════════════════════════════════════
function renderListingCard(listing, userId = null) {
  const owner   = Auth.getOwnerById(listing.ownerId) || { name: 'Owner' };
  const isFav   = userId ? Favorites.isFav(userId, listing.id) : false;
  const photo   = listing.photos?.[0] || null;
  const price   = listing.priceMonthly ? `₹${Number(listing.priceMonthly).toLocaleString('en-IN')}` : (listing.priceWeekly ? `₹${Number(listing.priceWeekly).toLocaleString('en-IN')}/wk` : '—');
  const initial = owner.name.charAt(0).toUpperCase();

  return `
    <div class="listing-card" data-id="${listing.id}">
      <div class="listing-card-img">
        ${photo
          ? `<img src="${sanitize(photo)}" alt="${sanitize(listing.title)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\'no-image-placeholder\'>🏠<br><small>No image</small></div>'">`
          : `<div class="no-image-placeholder">🏠</div>`}
        <div class="card-overlay"></div>
        <div class="card-badges">
          <span class="badge ${getCategoryBadge(listing.type)}">${sanitize(getCategoryLabel(listing.type))}</span>
          ${listing.featured ? '<span class="badge badge-featured">⭐ Featured</span>' : ''}
        </div>
        <div class="card-price">${price}<small>/mo</small></div>
        ${userId ? `<button class="wishlist-btn${isFav ? ' active' : ''}" onclick="toggleFav(event,'${listing.id}')" title="Save">♥</button>` : ''}
      </div>
      <div class="listing-card-body">
        <h3 title="${sanitize(listing.title)}">${sanitize(listing.title)}</h3>
        <div class="listing-location">📍 ${sanitize(listing.city)} · ${sanitize(listing.address.substring(0,30))}…</div>
        <div class="listing-meta">
          ${listing.priceDaily   ? `<span>🌙 ₹${Number(listing.priceDaily).toLocaleString('en-IN')}/day</span>` : ''}
          ${listing.priceWeekly  ? `<span>📅 ₹${Number(listing.priceWeekly).toLocaleString('en-IN')}/wk</span>` : ''}
          <span>👁 ${listing.views || 0} views</span>
        </div>
        <div class="listing-card-footer">
          <div class="owner-info">
            <div class="owner-avatar-sm">${initial}</div>
            <span class="owner-name">${sanitize(owner.name)}</span>
          </div>
          <a href="listing-detail.html?id=${listing.id}" class="btn btn-primary btn-sm">View →</a>
        </div>
      </div>
    </div>`;
}

function toggleFav(e, listingId) {
  e.preventDefault(); e.stopPropagation();
  const s = Auth.getSession();
  if (!s || s.role !== 'renter') { showToast('Please login as renter to save listings.', 'error'); return; }
  const added = Favorites.toggle(s.id, listingId);
  e.currentTarget.classList.toggle('active', added);
  showToast(added ? 'Added to favourites!' : 'Removed from favourites.', added ? 'success' : 'info');
}

// ═══════════════════════════════════════
// INIT
// ═══════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  seedDemoData();
  initNavbar();
  initScrollTop();
});

// ---------------------------------------
// CUSTOMER SUPPORT WIDGET
// ---------------------------------------
function initSupportWidget() {
  const container = document.createElement('div');
  container.innerHTML = `
    <div class="support-widget-popup" id="supportPopup">
      <div class="support-widget-header">
        🎧 Customer Care & Support
      </div>
      <div class="support-widget-body">
        <p>Need help booking a room or listing your property? Our team is here to assist you through the entire process!</p>
        <div class="support-widget-numbers">
          <a href="tel:7864043197">📞 +91 7864043197</a>
          <a href="tel:6295727553">📞 +91 6295727553</a>
        </div>
      </div>
    </div>
    <div class="support-widget-btn" onclick="document.getElementById('supportPopup').style.display = document.getElementById('supportPopup').style.display === 'flex' ? 'none' : 'flex'">
      💬
    </div>
  `;
  document.body.appendChild(container);
}

document.addEventListener('DOMContentLoaded', () => {
  initSupportWidget();
});
