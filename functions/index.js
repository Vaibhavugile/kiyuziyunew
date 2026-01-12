const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.backfillOrderProfit = onRequest(
  { timeoutSeconds: 540, memory: "1GiB" },
  async (req, res) => {
    try {
      const limit = 100;
      const startAfterId = req.query.startAfter || null;

      let queryRef = db
        .collection("orders")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(limit);

      if (startAfterId) {
        const lastDoc = await db.collection("orders").doc(startAfterId).get();
        if (lastDoc.exists) {
          queryRef = queryRef.startAfter(lastDoc);
        }
      }

      const snap = await queryRef.get();

      if (snap.empty) {
        return res.json({
          success: true,
          message: "Backfill completed",
          updatedOrders: 0,
        });
      }

      let updated = 0;
      let lastProcessedId = null;

      for (const docSnap of snap.docs) {
        const order = docSnap.data();
        let orderCost = 0;
        let orderProfit = 0;

        const items = order.items || [];

        for (const item of items) {
          if (!item.collectionId || !item.subcollectionId) continue;

          const subSnap = await db
            .collection("collections")
            .doc(item.collectionId)
            .collection("subcollections")
            .doc(item.subcollectionId)
            .get();

          const purchaseRate = subSnap.exists
            ? subSnap.data().purchaseRate || 0
            : 0;

          const qty = item.quantity || 0;
          const sell = item.priceAtTimeOfOrder || 0;

          item.purchaseRateAtOrder = purchaseRate;
          item.itemCost = purchaseRate * qty;
          item.itemProfit = (sell - purchaseRate) * qty;

          orderCost += item.itemCost;
        }

        // ❌ Ignore cancelled orders in profit
        if (order.status !== "Cancelled") {
          orderProfit = (order.totalAmount || 0) - orderCost;
        }

        await docSnap.ref.update({
          items,
          orderPurchaseCost: orderCost,
          orderProfit,
          profitCalculatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        updated++;
        lastProcessedId = docSnap.id;
      }

      return res.json({
        success: true,
        updatedOrders: updated,
        nextCursor: lastProcessedId,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);
