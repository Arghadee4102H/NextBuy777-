// Cloud Functions (2nd Gen) for NextBuy 77
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { sendTransactionalEmail, getOrderConfirmationEmailHtml } = require('./email-service');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Trigger: When an order is created, send confirmation email
 */
exports.onOrderCreated = onDocumentCreated('orders/{orderId}', async (event) => {
  const snap = event.data;
  if (!snap) return;

  const order = snap.data();
  const to = order.customerEmail;
  if (!to) return;

  const totalRupees = ((order.finalPayablePaise || 0) / 100).toFixed(2);
  const html = getOrderConfirmationEmailHtml({
    orderNumber: order.orderNumber || event.params.orderId,
    customerName: order.customerName,
    totalRupees,
    utr: order.utr
  });

  await sendTransactionalEmail({
    to,
    subject: `Order Confirmation - ${order.orderNumber || event.params.orderId} | NextBuy 77`,
    html
  });
});

/**
 * Scheduled Cron Job: Expire reservations older than 24 hours (Section 18)
 * Runs every hour to check pending payments and release reserved stock
 */
exports.expireReservationsCron = onSchedule({
  schedule: 'every 1 hours',
  timeZone: 'Asia/Kolkata',
  region: 'asia-south1'
}, async (event) => {
  const nowStr = new Date().toISOString();
  console.log(`[Scheduled Expiry] Checking expired reservations at ${nowStr}...`);

  const expiredSnap = await db.collection('orders')
    .where('paymentStatus', '==', 'Payment Submitted')
    .where('reservationExpiresAt', '<=', nowStr)
    .limit(50)
    .get();

  if (expiredSnap.empty) {
    console.log('[Scheduled Expiry] No expired reservations found.');
    return;
  }

  for (const docSnap of expiredSnap.docs) {
    const orderId = docSnap.id;
    const orderData = docSnap.data();

    await db.runTransaction(async (transaction) => {
      // Release inventory
      const items = orderData.itemsSnapshot || [];
      for (const item of items) {
        if (!item.id || item.id === 'sample_placeholder') continue;
        const invRef = db.collection('inventory').doc(item.id);
        const invDoc = await transaction.get(invRef);

        if (invDoc.exists) {
          const inv = invDoc.data();
          const qty = item.quantity || 1;
          const newReserved = Math.max(0, (inv.reserved || 0) - qty);

          transaction.update(invRef, {
            reserved: newReserved,
            available: (inv.onHand || 0) - newReserved,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }

      // Update Order Status
      const history = orderData.statusHistory || [];
      history.push({
        status: 'Reservation Expired',
        timestamp: new Date().toISOString(),
        note: 'Expired automatically after 24 hours without admin verification.'
      });

      transaction.update(docSnap.ref, {
        paymentStatus: 'Reservation Expired',
        orderStatus: 'Cancelled',
        statusHistory: history,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    console.log(`[Scheduled Expiry] Released stock and marked order ${orderId} as Reservation Expired.`);
  }
});

