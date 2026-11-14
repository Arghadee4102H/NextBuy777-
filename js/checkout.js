// Checkout Controller & Order Creation - NextBuy 77
import { db, auth } from './firebase-config.js';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  limit, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { cartManager } from './cart.js';
import { calculateOrderTotals, checkPinServiceability, generateIdempotencyKey } from './pricing-engine.js';
import { formatCurrency, showToast, validatePinCode, validateIndianMobile } from './utils.js';
import { i18n } from './i18n.js';

class CheckoutController {
  constructor() {
    this.currentUser = null;
    this.savedAddresses = [];
    this.selectedAddress = null;
    this.pinServiceability = { serviceable: false, pinData: null };
    this.orderCalculation = null;
    this.idempotencyKey = generateIdempotencyKey();
    this.isSubmitting = false;
    this.lastCreatedOrder = null;
  }

  async init(user) {
    this.currentUser = user;
    await this.loadAddresses();
    this.recalculateCheckout();
  }

  async loadAddresses() {
    if (!this.currentUser) return;
    try {
      const addrRef = collection(db, 'users', this.currentUser.uid, 'addresses');
      const snap = await getDocs(addrRef);
      this.savedAddresses = [];
      snap.forEach(d => this.savedAddresses.push({ id: d.id, ...d.data() }));

      this.renderAddressSelector();
      if (this.savedAddresses.length > 0) {
        await this.selectAddress(this.savedAddresses[0]);
      }
    } catch (err) {
      console.error('Error loading addresses for checkout', err);
    }
  }

  renderAddressSelector() {
    const container = document.getElementById('checkout-addresses-list');
    if (!container) return;

    if (this.savedAddresses.length === 0) {
      container.innerHTML = `
        <div style="padding: 16px; border: 1px dashed var(--color-border); border-radius: var(--radius-md); font-size: 14px; color: var(--color-text-muted);">
          No saved addresses. Please enter a delivery address below.
        </div>
      `;
      return;
    }

    let html = '';
    this.savedAddresses.forEach((addr, idx) => {
      const isSelected = this.selectedAddress && this.selectedAddress.id === addr.id;
      html += `
        <label style="display: flex; gap: 12px; padding: 12px; border: 1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}; border-radius: var(--radius-md); margin-bottom: 8px; cursor: pointer; background: ${isSelected ? 'var(--color-bg-subtle)' : 'var(--color-bg-surface)'};">
          <input type="radio" name="selected_address" value="${addr.id}" ${isSelected ? 'checked' : ''} style="margin-top: 4px;">
          <div style="font-size: 13px;">
            <strong>${addr.fullName}</strong> (${addr.mobile})<br>
            ${addr.houseBuilding}, ${addr.streetLocality}, ${addr.cityVillage}, ${addr.district}, ${addr.state} - <strong>${addr.pinCode}</strong>
          </div>
        </label>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll('input[name="selected_address"]').forEach(input => {
      input.addEventListener('change', async (e) => {
        const found = this.savedAddresses.find(a => a.id === e.target.value);
        if (found) await this.selectAddress(found);
      });
    });
  }

  async selectAddress(address) {
    this.selectedAddress = address;
    const pinCheck = await checkPinServiceability(address.pinCode);
    this.pinServiceability = pinCheck;

    const alertEl = document.getElementById('pin-availability-alert');
    if (alertEl) {
      if (!pinCheck.serviceable) {
        alertEl.style.display = 'block';
        alertEl.className = 'toast toast-danger';
        alertEl.textContent = pinCheck.reason || 'Service unavailable: Orders cannot be placed for this PIN code location.';
        document.getElementById('place-order-btn').disabled = true;
      } else {
        alertEl.style.display = 'block';
        alertEl.className = 'toast toast-success';
        alertEl.textContent = pinCheck.message || `Congratulations, orders can be placed for PIN code ${address.pinCode}!`;
        document.getElementById('place-order-btn').disabled = false;
      }
    }

    this.recalculateCheckout();
  }

  recalculateCheckout() {
    const items = cartManager.getItems();
    this.orderCalculation = calculateOrderTotals({
      items,
      pinData: this.pinServiceability.pinData
    });

    this.renderOrderSummary();
  }

  renderOrderSummary() {
    const calc = this.orderCalculation;
    if (!calc) return;

    document.getElementById('checkout-subtotal').textContent = formatCurrency(calc.subtotalPaise);
    
    const deliveryEl = document.getElementById('checkout-delivery');
    if (calc.isFreeDelivery) {
      deliveryEl.innerHTML = `<span style="color: var(--color-success); font-weight: 600;">FREE</span>`;
    } else {
      deliveryEl.textContent = formatCurrency(calc.deliveryPaise);
    }

    document.getElementById('checkout-total').textContent = formatCurrency(calc.finalPayablePaise);

    const upiAppBtn = document.getElementById('open-upi-app-btn');
    if (upiAppBtn) {
      const amountRupees = (calc.finalPayablePaise / 100).toFixed(2);
      upiAppBtn.href = `upi://pay?pa=9433204168@slc&pn=NextBuy%2077&am=${amountRupees}&cu=INR`;
    }

    // Render item lines
    const itemsContainer = document.getElementById('checkout-items-list');
    if (itemsContainer) {
      let html = '';
      calc.items.forEach(i => {
        const title = typeof i.name === 'object' ? (i.name[i18n.currentLanguage] || i.name['en']) : i.name;
        html += `
          <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px;">
            <span>${title} &times; ${i.quantity}</span>
            <strong>${formatCurrency(i.lineTotalPaise)}</strong>
          </div>
        `;
      });
      itemsContainer.innerHTML = html;
    }
  }

  /**
   * Create Pending Order in Firestore
   * Ensures idempotency: registers transaction only once even if clicked multiple times.
   * Empties the cart automatically upon order placement.
   */
  async createPendingOrder(utr = null) {
    if (this.isSubmitting) {
      if (this.lastCreatedOrder) return this.lastCreatedOrder;
      throw new Error('Order creation is already in progress. Please wait...');
    }
    if (this.lastCreatedOrder) {
      return this.lastCreatedOrder;
    }

    if (!this.currentUser) throw new Error('Please sign in to place your order.');
    if (!this.selectedAddress) throw new Error('Please select or add a delivery address.');
    
    // Strict PIN check verification
    const activePinCheck = await checkPinServiceability(this.selectedAddress.pinCode);
    if (!activePinCheck.serviceable) {
      throw new Error(activePinCheck.reason || 'Service unavailable: Orders cannot be placed for this PIN code location.');
    }
    this.pinServiceability = activePinCheck;

    const items = cartManager.getItems();
    if (items.length === 0) throw new Error('Your cart is empty.');

    this.isSubmitting = true;

    try {
      const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
      const cleanUtr = utr ? utr.trim().toUpperCase() : null;

      // Duplicate Reference Number Check (Requirement: No two reference numbers should be identical)
      if (cleanUtr) {
        await this.checkUtrAvailability(cleanUtr);
      }

      const orderData = {
        orderNumber,
        customerUid: this.currentUser.uid,
        customerEmail: this.currentUser.email,
        customerName: `${this.currentUser.displayName || ''}`.trim() || 'Customer',
        addressSnapshot: { ...this.selectedAddress },
        itemsSnapshot: this.orderCalculation.items,
        subtotalPaise: this.orderCalculation.subtotalPaise,
        deliveryPaise: this.orderCalculation.deliveryPaise,
        finalPayablePaise: this.orderCalculation.finalPayablePaise,
        paymentMethod: 'MANUAL_UPI',
        paymentStatus: 'Payment verification pending',
        orderStatus: 'Order Placed',
        idempotencyKey: this.idempotencyKey,
        termsAcceptedAt: new Date().toISOString(),
        termsVersion: '2026-10-27',
        statusHistory: [
          {
            status: 'Order Placed',
            note: 'Order confirmed by customer via Manual UPI',
            timestamp: new Date().toISOString()
          },
          {
            status: 'Payment verification pending',
            note: 'Manual UPI verification required (up to 24 hours)',
            timestamp: new Date().toISOString()
          }
        ],
        shippingCourier: 'Standard Express Courier',
        trackingNumber: '',
        dispatchedAt: null,
        estimatedDelivery: '3-5 business days',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (cleanUtr) {
        orderData.utr = cleanUtr;
        orderData.utrSubmittedAt = serverTimestamp();
      }

      const docRef = await addDoc(collection(db, 'orders'), orderData);

      if (cleanUtr) {
        try {
          await setDoc(doc(db, 'utrIndex', cleanUtr), {
            orderId: docRef.id,
            customerUid: this.currentUser.uid,
            createdAt: serverTimestamp()
          });
        } catch (utrErr) {
          console.warn('UTR index record notice:', utrErr);
        }
      }

      // Automatically remove/delete items from the cart
      cartManager.clearCart();

      this.lastCreatedOrder = {
        orderId: docRef.id,
        orderNumber,
        finalPayablePaise: this.orderCalculation.finalPayablePaise
      };

      return this.lastCreatedOrder;
    } finally {
      this.isSubmitting = false;
    }
  }

  /**
   * Check if a payment reference number (UTR) has already been used
   * Displays an explicit error/warning if a duplicate reference is detected.
   */
  async checkUtrAvailability(cleanUtr, currentOrderId = null) {
    if (!cleanUtr) return true;

    // Check UTR Index
    try {
      const utrDoc = await getDoc(doc(db, 'utrIndex', cleanUtr));
      if (utrDoc.exists()) {
        const data = utrDoc.data();
        if (!currentOrderId || data.orderId !== currentOrderId) {
          throw new Error(`Duplicate Reference Number: Payment reference "${cleanUtr}" is already in use for another order. Please verify your payment receipt and enter a unique reference number.`);
        }
      }
    } catch (e) {
      if (e.message && e.message.includes('Duplicate Reference Number')) throw e;
    }

    // Double check orders collection directly
    try {
      const q = query(collection(db, 'orders'), where('utr', '==', cleanUtr), limit(2));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const match = snap.docs.find(d => !currentOrderId || d.id !== currentOrderId);
        if (match) {
          throw new Error(`Duplicate Reference Number: Payment reference "${cleanUtr}" is already in use for another order. Please verify your payment receipt and enter a unique reference number.`);
        }
      }
    } catch (e) {
      if (e.message && e.message.includes('Duplicate Reference Number')) throw e;
    }

    return true;
  }

  async submitUtr(orderId, rawUtr) {
    if (!orderId) throw new Error('Order reference missing.');
    const cleanUtr = (rawUtr || '').trim().toUpperCase();
    if (!cleanUtr || cleanUtr.length < 6) {
      throw new Error('Please enter a valid 6-35 character UTR / Reference number.');
    }

    // Verify uniqueness before writing
    await this.checkUtrAvailability(cleanUtr, orderId);

    const orderRef = doc(db, 'orders', orderId);
    await updateDoc(orderRef, {
      utr: cleanUtr,
      paymentStatus: 'Payment verification pending',
      utrSubmittedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    try {
      await setDoc(doc(db, 'utrIndex', cleanUtr), {
        orderId: orderId,
        customerUid: this.currentUser?.uid || 'customer',
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.warn('UTR index update notice:', e);
    }

    return true;
  }
}

export const checkoutController = new CheckoutController();

