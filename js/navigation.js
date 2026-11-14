// Navigation Drawer & Header Controller - NextPay 7
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
    if (drawer) {
      drawer.classList.add('open');
    }
    if (backdrop) {
      backdrop.style.display = 'block';
      // Trigger smooth opacity transition
      requestAnimationFrame(() => {
        backdrop.classList.add('active');
      });
    }
    document.body.style.overflow = 'hidden';
  };

  const closeDrawer = () => {
    if (drawer) {
      drawer.classList.remove('open');
    }
    if (backdrop) {
      backdrop.classList.remove('active');
      setTimeout(() => {
        if (!drawer || !drawer.classList.contains('open')) {
          backdrop.style.display = 'none';
        }
      }, 250);
    }
    document.body.style.overflow = '';
  };

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openDrawer();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeDrawer();
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeDrawer();
    });
  }

  // Click anywhere outside the drawer closes it
  document.addEventListener('click', (e) => {
    if (drawer && drawer.classList.contains('open')) {
      const clickedInsideDrawer = drawer.contains(e.target);
      const clickedToggle = toggleBtn && toggleBtn.contains(e.target);
      if (!clickedInsideDrawer && !clickedToggle) {
        closeDrawer();
      }
    }
  });

  // Close when pressing Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer && drawer.classList.contains('open')) {
      closeDrawer();
    }
  });

  // Close drawer when any navigation link inside is clicked
  if (drawer) {
    drawer.querySelectorAll('.drawer-link').forEach(link => {
      link.addEventListener('click', () => {
        closeDrawer();
      });
    });
  }

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


