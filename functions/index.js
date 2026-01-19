/* eslint-disable no-console */
const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/* ======================================================
   🔹 MARK ORDER AS PAID (Razorpay callback)
====================================================== */
exports.markOrderPaid = functions.https.onRequest(async (req, res) => {
  // ---- CORS ----
  const allowedOrigins = [
    "https://kiyuziyuofficial.com",
    "http://localhost:3000",
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Max-Age", "3600");
    return res.status(204).send("");
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { orderId, paymentId } = req.body || {};

    if (!orderId || !paymentId) {
      return res.status(400).json({
        error: "Missing orderId or paymentId",
      });
    }

    const orderRef = db.collection("orders").doc(orderId);
    const snap = await orderRef.get();

    if (!snap.exists) {
      return res.status(404).json({
        error: "Order not found",
      });
    }

    await orderRef.update({
      paymentStatus: "PAID",
      paymentId,
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      success: true,
      orderId,
    });
  } catch (err) {
    console.error("markOrderPaid error:", err.message);
    return res.status(500).json({
      error: "Failed to mark order as paid",
    });
  }
});
