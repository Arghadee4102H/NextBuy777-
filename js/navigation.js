// Navigation Drawer & Header Controller - NextBuy 77
import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { cartManager } from './cart.js';
import { showToast } from './utils.js';

export function initNavigation() {
  const toggleBtn = document.getElementById('menu-toggle-btn');
  const drawer = document.getElementById('nav-drawer');
  const backdrop = document.getElementById('nav-drawer-backdrop');
  const closeBtn = document.getElementById('close-drawer-btn');

  const openDrawer = () => {
    if (drawer && backdrop) {
      drawer.classList.add('open');
      backdrop.style.display = 'block';
      document.body.style.overflow = 'hidden'; // prevent page background scroll while drawer open
    }
  };

  const closeDrawer = () => {
    if (drawer && backdrop) {
      drawer.classList.remove('open');
      backdrop.style.display = 'none';
      document.body.style.overflow = '';
    }
  };

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDrawer();
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });

  // Cart Badge sync
  cartManager.updateCartBadge();

  // Auth synchronization for drawer
  onAuthStateChanged(auth, (user) => {
    const userNameEl = document.getElementById('drawer-user-name');
    const userLinkEl = document.getElementById('drawer-login-link');
    const signOutBtn = document.getElementById('drawer-signout-btn');

    if (user) {
      const name = user.displayName ? user.displayName.split(' ')[0] : 'Customer';
      if (userNameEl) userNameEl.textContent = `Hello, ${name}`;
      if (userLinkEl) {
        userLinkEl.textContent = user.email || 'View Profile';
        userLinkEl.href = 'profile.html';
      }
      if (signOutBtn) {
        signOutBtn.style.display = 'block';
        signOutBtn.onclick = async () => {
          await signOut(auth);
          showToast('Signed out successfully.', 'info');
          window.location.reload();
        };
      }
    } else {
      if (userNameEl) userNameEl.textContent = 'Welcome, Guest';
      if (userLinkEl) {
        userLinkEl.textContent = 'Sign In to your account';
        userLinkEl.href = 'login.html?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
      }
      if (signOutBtn) signOutBtn.style.display = 'none';
    }
  });
}

