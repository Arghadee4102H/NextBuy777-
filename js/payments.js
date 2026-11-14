// Payment Management & UTR Stock Reservation - NextPay 7
import { db, auth } from './firebase-config.js';
import { 
  doc, 
  getDoc, 
  runTransaction, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { validateUtr, showToast, formatCurrency } from './utils.js';
import { cartManager } from './cart.js';

/**
 * Generate standard upi://pay URI for direct payment
 * @param {string} orderNumber 
 * @param {number} finalPayablePaise 
 * @returns {string}
 */
export function generateUpiPayUri(orderNumber, finalPayablePaise) {
  const upiId = '9433204168@slc';
  const payeeName = 'NextPay 7';
  const amountRupees = ((finalPayablePaise || 0) / 100).toFixed(2);
  const note = encodeURIComponent(`Order ${orderNumber}`);
  return `upi://pay?pa=${upiId}&pn=${encodeURIComponent(payeeName)}&am=${amountRupees}&cu=INR&tn=${note}`;
}

/**
 * Submit UTR with Atomic Stock Reservation and Unique UTR Enforcement
 * Requirements (Sections 17 & 18):
 * 1. Validates UTR format (6 to 35 chars).
 * 2. Checks global uniqueness via `utrIndex/{normalizedUtr}` in a transaction.
 * 3. Reserves inventory atomically (reduces available quantity, increases reserved quantity).
 * 4. Updates order paymentStatus to 'Payment Submitted' and status history.
 * 5. Clears shopping cart.
 * 
 * @param {string} orderId 
 * @param {string} rawUtr 
 * @returns {Promise<{ success: boolean, orderNumber: string }>}
 */
export async function submitUtrPayment(orderId, rawUtr) {
  if (!orderId) throw new Error('Order ID is required');

  const { valid, normalized } = validateUtr(rawUtr);
  if (!valid) {
    throw new Error('Please enter a valid 6 to 35 character alphanumeric UTR / Transaction Reference.');
  }

  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Authentication required.');

  const orderRef = doc(db, 'orders', orderId);
  const utrIndexRef = doc(db, 'utrIndex', normalized);

  let confirmedOrderNumber = '';

  await runTransaction(db, async (transaction) => {
    // Step 1: Check UTR Uniqueness
    const utrDoc = await transaction.get(utrIndexRef);
    if (utrDoc.exists()) {
      throw new Error('This UTR / Reference number has already been submitted for another order. Please check your bank transaction or contact support.');
    }

    // Step 2: Read Order
    const orderDoc = await transaction.get(orderRef);
    if (!orderDoc.exists()) {
      throw new Error('Order not found.');
    }

    const orderData = orderDoc.data();
    confirmedOrderNumber = orderData.orderNumber || orderId;

    if (orderData.paymentStatus === 'Payment Verified') {
      throw new Error('Payment for this order has already been verified.');
    }

    // Step 3: Check and Reserve Stock for all product items
    const items = orderData.itemsSnapshot || [];
    const inventoryUpdates = [];

    for (const item of items) {
      if (!item.id || item.id === 'sample_placeholder') continue;

      const invRef = doc(db, 'inventory', item.id);
      const invDoc = await transaction.get(invRef);

      if (invDoc.exists()) {
        const inv = invDoc.data();
        const onHand = inv.onHand || 0;
        const reserved = inv.reserved || 0;
        const available = onHand - reserved;
        const qtyNeeded = item.quantity || 1;

        if (available < qtyNeeded) {
          throw new Error(`Insufficient stock for "${item.name?.en || 'Product'}". Only ${available} available.`);
        }

        inventoryUpdates.push({
          ref: invRef,
          productId: item.id,
          newReserved: reserved + qtyNeeded,
          onHand,
          qtyNeeded
        });
      }
    }

    // Step 4: Execute Inventory Reservations
    for (const update of inventoryUpdates) {
      transaction.update(update.ref, {
        reserved: update.newReserved,
        available: update.onHand - update.newReserved,
        updatedAt: serverTimestamp()
      });

      // Write inventory movement log
      const movementRef = doc(db, 'inventoryMovements', `MOV_${Date.now()}_${update.productId}`);
      transaction.set(movementRef, {
        productId: update.productId,
        orderId: orderId,
        change: update.qtyNeeded,
        type: 'RESERVATION',
        reason: `UTR submission for ${confirmedOrderNumber}`,
        actorUid: currentUser.uid,
        createdAt: serverTimestamp()
      });
    }

    // Step 5: Claim UTR in Unique Index
    transaction.set(utrIndexRef, {
      utr: normalized,
      orderId: orderId,
      customerUid: currentUser.uid,
      claimedAt: serverTimestamp()
    });

    // Step 6: Update Order Status
    const statusHistory = orderData.statusHistory || [];
    statusHistory.push({
      status: 'Payment Submitted',
      utr: normalized,
      timestamp: new Date().toISOString(),
      updatedBy: currentUser.uid
    });

    transaction.update(orderRef, {
      utr: normalized,
      paymentStatus: 'Payment Submitted',
      orderStatus: 'Payment Submitted',
      reservationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24hr reservation
      statusHistory,
      updatedAt: serverTimestamp()
    });
  });

  // Step 7: Clear Cart upon successful reservation
  cartManager.clearCart();

  showToast(`UTR reference submitted! Order ${confirmedOrderNumber} is reserved.`, 'success', 5000);
  return { success: true, orderNumber: confirmedOrderNumber };
}


