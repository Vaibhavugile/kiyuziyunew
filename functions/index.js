const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

exports.onOrderCreated = onDocumentCreated(
  'orders/{orderId}',
  async (event) => {
    const order = event.data?.data();
    if (!order || !order.couponCode) return;

    const couponRef = db.collection('coupons').doc(order.couponCode);

    await db.runTransaction(async (tx) => {
      /* =========================
         FETCH COUPON
      ========================= */
      const couponSnap = await tx.get(couponRef);
      if (!couponSnap.exists) return;

      const coupon = couponSnap.data();

      /* =========================
         HARD VALIDATIONS
      ========================= */
      if (!coupon.isActive) throw new Error('Coupon disabled');
      if (coupon.expiry?.toDate() < new Date()) {
        throw new Error('Coupon expired');
      }

      // 🔐 Role check
      if (
        Array.isArray(coupon.allowedRoles) &&
        coupon.allowedRoles.length > 0 &&
        !coupon.allowedRoles.includes(order.role)
      ) {
        throw new Error('Coupon not allowed for role');
      }

      // 🌍 GLOBAL LIMIT
      if (
        coupon.maxUses > 0 &&
        coupon.usedCount >= coupon.maxUses
      ) {
        throw new Error('Coupon global limit reached');
      }

      /* =========================
         👤 PER-USER LIMIT (ZOMATO)
      ========================= */
      if (coupon.maxUsesPerUser > 0 && order.userId) {
        const usageQuery = db
          .collection('couponUsages')
          .where('couponCode', '==', order.couponCode)
          .where('userId', '==', order.userId);

        const usageSnap = await tx.get(usageQuery);

        if (usageSnap.size >= coupon.maxUsesPerUser) {
          throw new Error('Coupon already used by this customer');
        }
      }

      /* =========================
         ✅ APPLY COUPON
      ========================= */

      // 1️⃣ increment global usage
      tx.update(couponRef, {
        usedCount: admin.firestore.FieldValue.increment(1),
      });

      // 2️⃣ log usage
      tx.set(db.collection('couponUsages').doc(), {
        couponCode: order.couponCode,
        userId: order.userId || 'guest',
        role: order.role || 'retailer',
        orderId: event.params.orderId,
        orderTotal: order.totalAmount,
        discountAmount: order.couponDiscount || 0,
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  }
);
