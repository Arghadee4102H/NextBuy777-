// Admin Authentication & RBAC Guard - NextPay 7
import { auth, db } from '../../js/firebase-config.js';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast } from '../../js/utils.js';

class AdminAuthManager {
  constructor() {
    this.currentAdmin = null;
    this.adminData = null;
    this.idleTimer = null;
    this.IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  }

  async login(email, password) {
    const normalizedEmail = email.trim().toLowerCase();
    try {
      let cred;
      try {
        cred = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      } catch (signInErr) {
        // If designated super admin account does not exist yet in Firebase Auth, auto-create it
        if ((signInErr.code === 'auth/user-not-found' || signInErr.code === 'auth/invalid-credential') &&
            normalizedEmail === 'arghadeepg2006@gmail.com') {
          try {
            cred = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
          } catch (createErr) {
            throw signInErr; // Rethrow original if creation fails (e.g. wrong password on existing account)
          }
        } else {
          throw signInErr;
        }
      }

      const isAuthorized = await this.verifyAdminAccess(cred.user);
      if (!isAuthorized) {
        await signOut(auth);
        throw new Error('Access Denied: You do not have administrator permissions for NextPay 7.');
      }
      window.location.href = 'dashboard.html';
    } catch (err) {
      throw err;
    }
  }

  async verifyAdminAccess(user) {
    if (!user) return false;
    try {
      // Auto-bootstrap designated super admin
      if (user.email && user.email.toLowerCase() === 'arghadeepg2006@gmail.com') {
        const adminRef = doc(db, 'adminUsers', user.uid);
        const adminDoc = await getDoc(adminRef);
        if (!adminDoc.exists()) {
          try {
            await setDoc(adminRef, {
              uid: user.uid,
              email: user.email,
              displayName: 'Super Admin',
              role: 'Super Admin',
              status: 'active',
              permissions: ['ALL'],
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          } catch (e) {
            console.warn('Bootstrap adminUsers record notice:', e);
          }
        }
        this.adminData = {
          role: 'Super Admin',
          permissions: ['ALL'],
          displayName: 'Super Admin',
          status: 'active'
        };
        return true;
      }

      // 1. Check custom claim token
      const idTokenResult = await user.getIdTokenResult(true);
      if (idTokenResult.claims.admin) {
        return true;
      }

      // 2. Fallback check: Firestore adminUsers/{uid}
      const adminDoc = await getDoc(doc(db, 'adminUsers', user.uid));
      if (adminDoc.exists() && adminDoc.data().status === 'active') {
        this.adminData = adminDoc.data();
        return true;
      }
    } catch (err) {
      console.error('Error verifying admin access', err);
    }
    return false;
  }

  protectPage() {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = 'index.html';
        return;
      }

      const authorized = await this.verifyAdminAccess(user);
      if (!authorized) {
        await signOut(auth);
        window.location.href = 'index.html';
        return;
      }

      this.currentAdmin = user;
      this.initIdleTimer();
      this.updateAdminHeader(user);
    });
  }

  hasPermission(permKey) {
    if (!this.adminData) return false;
    if (this.adminData.role === 'Super Admin' || (this.adminData.permissions || []).includes('ALL')) {
      return true;
    }
    return (this.adminData.permissions || []).includes(permKey);
  }

  initIdleTimer() {
    const resetTimer = () => {
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => {
        showToast('Session expired due to inactivity. Signing out...', 'warning');
        this.logout();
      }, this.IDLE_TIMEOUT_MS);
    };

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    resetTimer();
  }

  updateAdminHeader(user) {
    const nameEl = document.getElementById('admin-display-name');
    if (nameEl) {
      nameEl.textContent = this.adminData?.displayName || user.email;
    }
  }

  async logout() {
    await signOut(auth);
    window.location.href = 'index.html';
  }
}

export const adminAuth = new AdminAuthManager();

