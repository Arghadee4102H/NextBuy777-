// Customer Authentication & Profile Management - NextPay 7
import { auth, db } from './firebase-config.js';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult,
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { showToast, validateIndianMobile } from './utils.js';
import { i18n } from './i18n.js';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Detect in-app browsers (Instagram, Facebook, WhatsApp, etc.)
 * Google Sign-In is often blocked in embedded WebViews (disallowed_useragent)
 * @returns {boolean}
 */
export function detectInAppBrowser() {
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  return /FBAN|FBAV|Instagram|WhatsApp|Line|Twitter|Snapchat/i.test(ua);
}

/**
 * Sign in customer using Google
 * Uses Popup with automatic fallback to Redirect
 */
export async function signInWithGoogle() {
  if (detectInAppBrowser()) {
    showToast('Please open NextPay 7 in Chrome or Safari to complete Google Sign-In.', 'warning', 6000);
    return null;
  }

  try {
    const result = await signInWithPopup(auth, googleProvider);
    return await handleAuthSuccess(result.user);
  } catch (err) {
    console.warn('Popup sign-in failed or blocked, attempting redirect fallback...', err);
    if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
      try {
        await signInWithRedirect(auth, googleProvider);
      } catch (redirectErr) {
        console.error('Redirect sign-in also failed', redirectErr);
        showToast('Google Sign-In failed. Please try again.', 'danger');
      }
    } else {
      showToast(err.message || 'Authentication error', 'danger');
    }
    return null;
  }
}

/**
 * Check redirect result on page load
 */
export async function checkRedirectAuthResult() {
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      return await handleAuthSuccess(result.user);
    }
  } catch (err) {
    console.error('Error handling redirect sign-in', err);
  }
  return null;
}

/**
 * Handle successful authentication:
 * Fetches or creates customer profile in Firestore `users/{uid}`
 * NEVER saves Google photo URL (per Section 10 rules).
 */
async function handleAuthSuccess(user) {
  if (!user) return null;
  const userRef = doc(db, 'users', user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    // New user record creation
    const names = (user.displayName || '').split(' ');
    const firstName = names[0] || '';
    const lastName = names.slice(1).join(' ') || '';

    const newProfile = {
      uid: user.uid,
      email: user.email,
      firstName: firstName,
      lastName: lastName,
      mobile: '',
      language: i18n.currentLanguage || 'en',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      bonusBalancePaise: 0,
      loyaltyPoints: 0,
      totalOrders: 0,
      status: 'active'
    };

    await setDoc(userRef, newProfile);
    return { isNew: true, profile: newProfile };
  } else {
    const profile = snap.data();
    return { isNew: false, profile };
  }
}

/**
 * Save / Update customer profile details
 * @param {string} uid 
 * @param {Object} data 
 */
export async function saveCustomerProfile(uid, data) {
  if (!uid) throw new Error('User ID is required');

  if (data.mobile && !validateIndianMobile(data.mobile)) {
    throw new Error('Please enter a valid 10-digit Indian mobile number');
  }

  const userRef = doc(db, 'users', uid);
  const updatePayload = {
    firstName: data.firstName?.trim() || '',
    lastName: data.lastName?.trim() || '',
    mobile: data.mobile?.trim() || '',
    language: data.language || i18n.currentLanguage || 'en',
    updatedAt: serverTimestamp()
  };

  // Date of birth can only be set once (Section 10)
  if (data.dateOfBirth) {
    const currentSnap = await getDoc(userRef);
    if (!currentSnap.data()?.dateOfBirth) {
      updatePayload.dateOfBirth = data.dateOfBirth;
    }
  }

  await updateDoc(userRef, updatePayload);
  showToast('Profile updated successfully!', 'success');
}

/**
 * Customer Sign Out
 */
export async function customerSignOut() {
  await signOut(auth);
  showToast('Signed out successfully.', 'info');
  window.location.href = 'index.html';
}


