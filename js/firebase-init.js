// Firebase v10 Compat SDK Initialization
// (Loaded via CDN in HTML files before app.js)

const firebaseConfig = {
  apiKey: "AIzaSyBoDqcOzB08ZHD-VmAJrukmMqqPIy3_NFA",
  authDomain: "home-c9542.firebaseapp.com",
  projectId: "home-c9542",
  storageBucket: "home-c9542.firebasestorage.app",
  messagingSenderId: "1003898339936",
  appId: "1:1003898339936:web:689632b97aaf73a8cb3905",
  measurementId: "G-2PEZ99QTZV"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize Services
const db = firebase.firestore();
const auth = firebase.auth();
const storage = firebase.storage();

// Expose globally for app.js
window.db = db;
window.auth = auth;
window.storage = storage;
window.firebase = firebase;
