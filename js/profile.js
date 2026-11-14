// Customer Profile & Address Management - NextPay 7
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
      this.savedAddresses = addresses;

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
          <div class="saved-address-card" data-address-id="${a.id}" style="background: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 16px; margin-bottom: 12px; position: relative; transition: all 0.2s ease;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <strong style="font-size: 15px;">${escapeHtml(a.fullName)}</strong>
              <div style="display: flex; gap: 8px;">
                <button class="btn btn-sm btn-secondary edit-addr-btn" data-id="${a.id}" title="Edit this address" style="padding: 4px 10px; font-size: 12px;">✏️ Edit</button>
                <button class="btn btn-sm btn-secondary delete-addr-btn" data-id="${a.id}" title="Delete this address" style="color: var(--color-danger); border-color: #FEB2B2; padding: 4px 10px; font-size: 12px;">🗑️ Delete</button>
              </div>
            </div>
            <p style="font-size: 14px; margin-bottom: 4px; color: var(--color-text-main); line-height: 1.4;">
              ${escapeHtml(a.houseBuilding)}, ${escapeHtml(a.streetLocality)}, ${escapeHtml(a.cityVillage)}
            </p>
            <p style="font-size: 14px; margin-bottom: 4px; color: var(--color-text-main);">
              ${escapeHtml(a.district)}, ${escapeHtml(a.state)} — <strong>${escapeHtml(a.pinCode)}</strong>
            </p>
            <p style="font-size: 13px; color: var(--color-text-muted); margin-bottom: 0;">
              📞 Mobile: ${escapeHtml(a.mobile)}
            </p>
          </div>
        `;
      });

      container.innerHTML = html;

      // Bind Edit Address
      container.querySelectorAll('.edit-addr-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          this.editAddress(id);
        });
      });

      // Bind Delete Address
      container.querySelectorAll('.delete-addr-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-id');
          if (confirm('Are you sure you want to delete this delivery address?')) {
            await this.deleteAddress(id);
          }
        });
      });
    } catch (err) {
      console.error('Error loading addresses', err);
    }
  }

  /**
   * Populate form for editing an existing address
   */
  editAddress(id) {
    if (!this.savedAddresses) return;
    const a = this.savedAddresses.find(item => item.id === id);
    if (!a) return;

    const formTitle = document.getElementById('address-form-title');
    const submitBtn = document.getElementById('save-address-btn');
    const editIdInput = document.getElementById('editing-address-id');
    const cancelBtn = document.getElementById('cancel-edit-address-btn');

    if (formTitle) formTitle.textContent = '✏️ Edit Delivery Address';
    if (submitBtn) {
      submitBtn.textContent = 'Update Address';
      submitBtn.className = 'btn btn-primary btn-block';
    }
    if (editIdInput) editIdInput.value = id;
    if (cancelBtn) cancelBtn.style.display = 'inline-block';

    const fn = document.getElementById('addr-fullname');
    const mob = document.getElementById('addr-mobile');
    const house = document.getElementById('addr-house');
    const street = document.getElementById('addr-street');
    const city = document.getElementById('addr-city');
    const pin = document.getElementById('addr-pincode');
    const dist = document.getElementById('addr-district');
    const state = document.getElementById('addr-state');

    if (fn) fn.value = a.fullName || '';
    if (mob) mob.value = a.mobile || '';
    if (house) house.value = a.houseBuilding || '';
    if (street) street.value = a.streetLocality || '';
    if (city) city.value = a.cityVillage || '';
    if (pin) pin.value = a.pinCode || '';
    if (dist) dist.value = a.district || '';
    if (state) state.value = a.state || '';

    // Scroll form into view with smooth behavior
    const formCard = document.getElementById('add-address-form');
    if (formCard) {
      formCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      formCard.classList.add('pulse-focus');
      setTimeout(() => formCard.classList.remove('pulse-focus'), 1500);
    }
  }

  /**
   * Reset address form back to add mode
   */
  cancelAddressEdit() {
    const formTitle = document.getElementById('address-form-title');
    const submitBtn = document.getElementById('save-address-btn');
    const editIdInput = document.getElementById('editing-address-id');
    const cancelBtn = document.getElementById('cancel-edit-address-btn');
    const form = document.getElementById('add-address-form');

    if (formTitle) formTitle.textContent = 'Add New Delivery Address';
    if (submitBtn) {
      submitBtn.textContent = 'Save Address';
      submitBtn.className = 'btn btn-secondary btn-block';
    }
    if (editIdInput) editIdInput.value = '';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (form) form.reset();
  }

  async saveAddress(data, editingId = null) {
    const user = this.currentUser || auth.currentUser;
    if (!user) {
      throw new Error('You must be signed in to save an address.');
    }
    this.currentUser = user;

    const cleanMobile = data.mobile ? data.mobile.toString().trim().replace(/[\s\-\(\)]/g, '').replace(/^(?:\+91|91|0)/, '') : '';
    const cleanPin = data.pinCode ? data.pinCode.toString().trim() : '';

    if (!validatePinCode(cleanPin)) {
      throw new Error('Please enter a valid PIN Code.');
    }
    if (!validateIndianMobile(cleanMobile)) {
      throw new Error('Please enter a valid 10-digit Indian mobile number.');
    }

    const docData = {
      fullName: data.fullName.trim(),
      mobile: cleanMobile,
      houseBuilding: data.houseBuilding.trim(),
      streetLocality: data.streetLocality.trim(),
      cityVillage: data.cityVillage.trim(),
      district: data.district.trim(),
      state: data.state.trim(),
      pinCode: cleanPin,
      updatedAt: serverTimestamp()
    };

    if (editingId) {
      // Modify/Update existing address
      const docRef = doc(db, 'users', user.uid, 'addresses', editingId);
      await updateDoc(docRef, docData);
      showToast('Delivery address updated successfully!', 'success');
      this.cancelAddressEdit();
    } else {
      // Create new address
      docData.createdAt = serverTimestamp();
      const addrRef = collection(db, 'users', user.uid, 'addresses');
      await addDoc(addrRef, docData);
      showToast('Delivery address saved!', 'success');
      this.cancelAddressEdit();
    }

    await this.loadAddresses();
    return true;
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


