// Customer Profile & Address Management - NextBuy 77
import { db, auth } from './firebase-config.js';
import { 
  doc, 
  getDoc, 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { formatCurrency, formatDateIST, showToast, validatePinCode, validateIndianMobile, escapeHtml } from './utils.js';
import { i18n } from './i18n.js';
import { saveCustomerProfile, customerSignOut } from './firebase-auth.js';

class ProfileController {
  constructor() {
    this.currentUser = null;
    this.profileData = null;
  }

  async init(user) {
    this.currentUser = user;
    await this.loadProfile();
    await this.loadAddresses();
    await this.loadOrders();
  }

  async loadProfile() {
    const user = this.currentUser || auth.currentUser;
    if (!user) return;
    this.currentUser = user;
    try {
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        this.profileData = snap.data();
        this.renderPersonalInfo(this.profileData);
      }
    } catch (err) {
      console.error('Error loading profile', err);
    }
  }

  renderPersonalInfo(data) {
    const fnInput = document.getElementById('profile-first-name');
    const lnInput = document.getElementById('profile-last-name');
    const emailInput = document.getElementById('profile-email');
    const mobileInput = document.getElementById('profile-mobile');
    const dobInput = document.getElementById('profile-dob');

    if (fnInput) fnInput.value = data.firstName || '';
    if (lnInput) lnInput.value = data.lastName || '';
    if (emailInput) emailInput.value = data.email || this.currentUser.email || '';
    if (mobileInput) mobileInput.value = data.mobile || '';

    if (dobInput) {
      if (data.dateOfBirth) {
        dobInput.value = data.dateOfBirth;
        dobInput.disabled = true; // Section 10: Can be set once, then locked
        document.getElementById('dob-lock-msg')?.classList.remove('hidden');
      } else {
        dobInput.disabled = false;
      }
    }

    // Balance & Loyalty stats
    const bonusEl = document.getElementById('stat-bonus-balance');
    const loyaltyEl = document.getElementById('stat-loyalty-points');
    if (bonusEl) bonusEl.textContent = formatCurrency(data.bonusBalancePaise || 0);
    if (loyaltyEl) loyaltyEl.textContent = `${data.loyaltyPoints || 0} pts`;
  }

  async updatePersonalDetails(formData) {
    const user = this.currentUser || auth.currentUser;
    if (!user) return;
    this.currentUser = user;
    try {
      await saveCustomerProfile(user.uid, formData);
      await this.loadProfile();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  // --- Saved Addresses Subcollection Management ---

  async loadAddresses() {
    const user = this.currentUser || auth.currentUser;
    if (!user) return;
    this.currentUser = user;
    const container = document.getElementById('addresses-list');
    if (!container) return;

    try {
      const addrRef = collection(db, 'users', user.uid, 'addresses');
      const snap = await getDocs(addrRef);
      const addresses = [];
      snap.forEach(doc => addresses.push({ id: doc.id, ...doc.data() }));

      if (addresses.length === 0) {
        container.innerHTML = `
          <div style="padding: 24px; text-align: center; border: 2px dashed var(--color-border); border-radius: var(--radius-md); color: var(--color-text-muted);">
            No saved addresses found. Add a delivery address for fast checkout.
          </div>
        `;
        return;
      }

      let html = '';
      addresses.forEach(a => {
        html += `
          <div style="background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 16px; margin-bottom: 12px; position: relative;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <strong>${escapeHtml(a.fullName)}</strong>
              <div>
                <button class="btn btn-sm btn-secondary delete-addr-btn" data-id="${a.id}">Delete</button>
              </div>
            </div>
            <p style="font-size: 14px; margin-bottom: 4px; color: var(--color-text-main);">
              ${escapeHtml(a.houseBuilding)}, ${escapeHtml(a.streetLocality)}, ${escapeHtml(a.cityVillage)}
            </p>
            <p style="font-size: 14px; margin-bottom: 4px; color: var(--color-text-main);">
              ${escapeHtml(a.district)}, ${escapeHtml(a.state)} — <strong>${escapeHtml(a.pinCode)}</strong>
            </p>
            <p style="font-size: 13px; color: var(--color-text-muted);">
              📞 Mobile: ${escapeHtml(a.mobile)}
            </p>
          </div>
        `;
      });

      container.innerHTML = html;

      container.querySelectorAll('.delete-addr-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          if (confirm('Delete this address?')) {
            await this.deleteAddress(id);
          }
        });
      });
    } catch (err) {
      console.error('Error loading addresses', err);
    }
  }

  async saveAddress(data) {
    const user = this.currentUser || auth.currentUser;
    if (!user) {
      throw new Error('You must be signed in to save an address.');
    }
    this.currentUser = user;

    const cleanMobile = data.mobile ? data.mobile.toString().trim().replace(/[\s\-\(\)]/g, '').replace(/^(?:\+91|91|0)/, '') : '';
    const cleanPin = data.pinCode ? data.pinCode.toString().trim() : '';

    if (!validatePinCode(cleanPin)) {
      throw new Error('Please enter a valid 6-digit Indian PIN Code.');
    }
    if (!validateIndianMobile(cleanMobile)) {
      throw new Error('Please enter a valid 10-digit Indian mobile number.');
    }

    const addrRef = collection(db, 'users', user.uid, 'addresses');
    const docData = {
      ...data,
      pinCode: cleanPin,
      mobile: cleanMobile,
      createdAt: serverTimestamp()
    };
    const newDoc = await addDoc(addrRef, docData);

    showToast('Delivery address saved!', 'success');
    await this.loadAddresses();
    return { id: newDoc.id, ...docData };
  }

  async deleteAddress(id) {
    const user = this.currentUser || auth.currentUser;
    if (!user || !id) return;
    this.currentUser = user;
    const docRef = doc(db, 'users', user.uid, 'addresses', id);
    await deleteDoc(docRef);
    showToast('Address removed.', 'info');
    await this.loadAddresses();
  }

  // --- Orders List ---

  async loadOrders() {
    const user = this.currentUser || auth.currentUser;
    if (!user) return;
    this.currentUser = user;
    const container = document.getElementById('orders-list');
    if (!container) return;

    try {
      const ordersRef = collection(db, 'orders');
      const q = query(ordersRef, where('customerUid', '==', user.uid), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      const orders = [];
      snap.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));

      if (orders.length === 0) {
        container.innerHTML = `
          <div style="padding: 32px; text-align: center; border: 2px dashed var(--color-border); border-radius: var(--radius-md); color: var(--color-text-muted);">
            You haven't placed any orders yet. Discover our catalog today!
          </div>
        `;
        return;
      }

      let html = '';
      orders.forEach(o => {
        const dateStr = formatDateIST(o.createdAt?.toDate ? o.createdAt.toDate() : o.createdAt);
        const total = formatCurrency(o.finalPayablePaise || 0);

        html += `
          <div style="background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 16px; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
              <div>
                <strong>${o.orderNumber || o.id}</strong>
                <span style="font-size: 12px; color: var(--color-text-muted); margin-left: 8px;">${dateStr}</span>
              </div>
              <span style="font-size: 15px; font-weight: 700; color: var(--color-primary);">${total}</span>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px;">
              <span style="padding: 3px 8px; border-radius: 4px; font-size: 12px; background: #FFF8E7; color: #8A5800; border: 1px solid #F5C26B;">
                Payment: <strong>${escapeHtml(o.paymentStatus || 'Payment verification pending')}</strong>
              </span>
              <span style="padding: 3px 8px; border-radius: 4px; font-size: 12px; background: var(--color-info-bg); color: var(--color-info);">
                Order: <strong>${escapeHtml(o.orderStatus || 'Order Placed')}</strong>
              </span>
              ${o.trackingNumber ? `<span style="padding: 3px 8px; border-radius: 4px; font-size: 12px; background: var(--color-bg-subtle);">Tracking: <strong>${escapeHtml(o.trackingNumber)}</strong></span>` : ''}
            </div>
            <div style="border-top: 1px solid var(--color-border); padding-top: 8px; display: flex; justify-content: flex-end;">
              <a href="order-details.html?id=${o.id}" class="btn btn-sm btn-secondary" style="font-size: 12px;">
                View Full Details, Tracking & Invoice &rarr;
              </a>
            </div>
          </div>
        `;
      });
      container.innerHTML = html;
    } catch (err) {
      console.warn('Orders query handled (awaiting active orders collection)', err);
    }
  }
}

export const profileController = new ProfileController();

