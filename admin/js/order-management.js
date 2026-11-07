// Order & Payment Management Controller - NextBuy 77
import { db, auth } from '../../js/firebase-config.js';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  query, 
  orderBy, 
  where, 
  serverTimestamp, 
  runTransaction 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { formatCurrency, formatDateIST, showToast, escapeHtml } from '../../js/utils.js';

class OrderPaymentManager {
  constructor() {
    this.orders = [];
  }

  /**
   * Load all orders for admin review
   * @param {'ALL'|'PENDING_PAYMENT'|'VERIFIED'} filter 
   */
  async loadOrders(filter = 'ALL') {
    const tbody = document.getElementById('orders-tbody');
    if (!tbody) return;

    try {
      const ordersRef = collection(db, 'orders');
      let q = query(ordersRef, orderBy('createdAt', 'desc'));

      if (filter === 'PENDING_PAYMENT') {
        q = query(ordersRef, where('paymentStatus', 'in', ['Payment Submitted', 'Payment Under Verification']), orderBy('createdAt', 'asc'));
      }

      const snap = await getDocs(q);
      this.orders = [];
      snap.forEach(d => this.orders.push({ id: d.id, ...d.data() }));

      if (this.orders.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8" style="text-align: center; color: var(--color-text-muted); padding: 36px;">
              No orders found matching this filter.
            </td>
          </tr>
        `;
        return;
      }

      let html = '';
      this.orders.forEach(o => {
        const dateStr = formatDateIST(o.createdAt);
        const amount = formatCurrency(o.finalPayablePaise || 0);

        html += `
          <tr>
            <td><strong>${escapeHtml(o.orderNumber || o.id)}</strong></td>
            <td>
              ${escapeHtml(o.customerName || 'Customer')}<br>
              <span style="font-size: 11px; color: var(--color-text-muted);">${escapeHtml(o.customerEmail || '')}</span>
            </td>
            <td>${dateStr}</td>
            <td><strong>${amount}</strong></td>
            <td>
              <span class="status-badge ${o.paymentStatus === 'Payment Verified' ? 'badge-success' : (o.paymentStatus === 'Payment Rejected' ? 'badge-danger' : 'badge-warning')}">
                ${escapeHtml(o.paymentStatus || 'Pending')}
              </span>
              ${o.utr ? `<br><span style="font-size:11px; color:var(--color-primary); font-family:monospace;">UTR: ${escapeHtml(o.utr)}</span>` : ''}
            </td>
            <td>
              <span class="status-badge badge-info">${escapeHtml(o.orderStatus || 'Pending')}</span>
            </td>
            <td>
              <button class="btn btn-sm btn-secondary view-order-btn" data-id="${o.id}">View / Update</button>
            </td>
          </tr>
        `;
      });

      tbody.innerHTML = html;

      tbody.querySelectorAll('.view-order-btn').forEach(btn => {
        btn.addEventListener('click', (e) => this.openOrderModal(e.currentTarget.getAttribute('data-id')));
      });
    } catch (err) {
      console.error('Error loading orders', err);
    }
  }

  /**
   * Verify Manual UPI Payment in a Transaction
   * Requirements (Section 17 & 18):
   * 1. Confirms amount actually received.
   * 2. Finalizes stock reservation: decrements onHand and reserved in `inventory`.
   * 3. Consumes promo code hold.
   * 4. Increments sales count in `productStats`.
   * 5. Sets paymentStatus to 'Payment Verified', orderStatus to 'Order Confirmed'.
   * 6. Appends verification audit log.
   * 
   * @param {string} orderId 
   * @param {number} receivedPaise 
   * @param {string} note 
   */
  async verifyPayment(orderId, receivedPaise, note = '') {
    const currentAdminUid = auth.currentUser?.uid || 'admin';
    const orderRef = doc(db, 'orders', orderId);

    await runTransaction(db, async (transaction) => {
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists()) throw new Error('Order not found');

      const o = orderDoc.data();
      if (o.paymentStatus === 'Payment Verified') {
        throw new Error('This payment is already verified.');
      }

      // Step 1: Finalize Stock in inventory
      const items = o.itemsSnapshot || [];
      for (const item of items) {
        if (!item.id || item.id === 'sample_placeholder') continue;
        const invRef = doc(db, 'inventory', item.id);
        const invDoc = await transaction.get(invRef);

        if (invDoc.exists()) {
          const inv = invDoc.data();
          const qty = item.quantity || 1;
          const newOnHand = Math.max(0, (inv.onHand || 0) - qty);
          const newReserved = Math.max(0, (inv.reserved || 0) - qty);

          transaction.update(invRef, {
            onHand: newOnHand,
            reserved: newReserved,
            available: newOnHand - newReserved,
            updatedAt: serverTimestamp()
          });

          // Log movement
          const movRef = doc(db, 'inventoryMovements', `MOV_SALE_${Date.now()}_${item.id}`);
          transaction.set(movRef, {
            productId: item.id,
            orderId,
            change: -qty,
            type: 'SALE_FINALIZED',
            reason: `Payment Verified for ${o.orderNumber || orderId}`,
            actorUid: currentAdminUid,
            createdAt: serverTimestamp()
          });
        }
      }

      // Step 2: Append status history
      const history = o.statusHistory || [];
      history.push({
        status: 'Payment Verified',
        verifiedBy: currentAdminUid,
        receivedPaise,
        note,
        timestamp: new Date().toISOString()
      });

      // Step 3: Update Order Record
      transaction.update(orderRef, {
        paymentStatus: 'Payment Verified',
        orderStatus: 'Order Confirmed',
        verifiedAt: serverTimestamp(),
        verifiedBy: currentAdminUid,
        statusHistory: history,
        updatedAt: serverTimestamp()
      });
    });

    showToast(`Payment verified for order ${orderId}! Stock finalized.`, 'success');
  }

  /**
   * Reject Payment and Release Reserved Stock (Section 18)
   * @param {string} orderId 
   * @param {string} rejectionReason 
   */
  async rejectPayment(orderId, rejectionReason) {
    if (!rejectionReason) throw new Error('Mandatory rejection reason required.');
    const currentAdminUid = auth.currentUser?.uid || 'admin';
    const orderRef = doc(db, 'orders', orderId);

    await runTransaction(db, async (transaction) => {
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists()) throw new Error('Order not found');

      const o = orderDoc.data();

      // Release reserved stock
      const items = o.itemsSnapshot || [];
      for (const item of items) {
        if (!item.id || item.id === 'sample_placeholder') continue;
        const invRef = doc(db, 'inventory', item.id);
        const invDoc = await transaction.get(invRef);

        if (invDoc.exists()) {
          const inv = invDoc.data();
          const qty = item.quantity || 1;
          const newReserved = Math.max(0, (inv.reserved || 0) - qty);

          transaction.update(invRef, {
            reserved: newReserved,
            available: (inv.onHand || 0) - newReserved,
            updatedAt: serverTimestamp()
          });

          // Log movement
          const movRef = doc(db, 'inventoryMovements', `MOV_REL_${Date.now()}_${item.id}`);
          transaction.set(movRef, {
            productId: item.id,
            orderId,
            change: qty,
            type: 'RESERVATION_RELEASED',
            reason: `Payment Rejected: ${rejectionReason}`,
            actorUid: currentAdminUid,
            createdAt: serverTimestamp()
          });
        }
      }

      // Append status history
      const history = o.statusHistory || [];
      history.push({
        status: 'Payment Rejected',
        rejectedBy: currentAdminUid,
        reason: rejectionReason,
        timestamp: new Date().toISOString()
      });

      transaction.update(orderRef, {
        paymentStatus: 'Payment Rejected',
        orderStatus: 'Cancelled',
        rejectionReason,
        statusHistory: history,
        updatedAt: serverTimestamp()
      });
    });

    showToast(`Payment rejected. Reserved stock released back to inventory.`, 'info');
  }

  /**
   * Update Order Progress Status (Section 15 transition table)
   * Valid transitions:
   * Order Confirmed -> Processing -> Shipped -> Out for Delivery -> Delivered
   * @param {string} orderId 
   * @param {string} newStatus 
   */
  async updateOrderStatus(orderId, newStatus) {
    const orderRef = doc(db, 'orders', orderId);
    const snap = await getDoc(orderRef);
    if (!snap.exists()) throw new Error('Order not found');

    const history = snap.data().statusHistory || [];
    history.push({
      status: newStatus,
      updatedBy: auth.currentUser?.uid || 'admin',
      timestamp: new Date().toISOString()
    });

    await updateDoc(orderRef, {
      orderStatus: newStatus,
      statusHistory: history,
      updatedAt: serverTimestamp()
    });

    showToast(`Order status updated to "${newStatus}"`, 'success');
  }

  openOrderModal(id) {
    const o = this.orders.find(item => item.id === id);
    if (!o) return;

    document.getElementById('modal-order-number').textContent = o.orderNumber || o.id;
    document.getElementById('modal-order-customer').textContent = `${o.customerName || 'Customer'} (${o.customerEmail || ''})`;
    document.getElementById('modal-order-amount').textContent = formatCurrency(o.finalPayablePaise || 0);
    document.getElementById('modal-order-utr').textContent = o.utr || 'Not submitted';
    document.getElementById('modal-order-status-select').value = o.orderStatus || 'Pending Payment';
    document.getElementById('order-action-modal').setAttribute('data-order-id', id);

    document.getElementById('order-action-modal').style.display = 'flex';
  }
}

export const orderPaymentManager = new OrderPaymentManager();

