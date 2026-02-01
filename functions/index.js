/* eslint-disable no-console */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const Razorpay = require("razorpay");

admin.initializeApp();
const db = admin.firestore();

/* ======================================================
   🔹 CREATE RAZORPAY ORDER (ENABLES UPI / QR)
====================================================== */
exports.createRazorpayOrder = functions.https.onRequest(async (req, res) => {
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
    const { amount, receipt } = req.body || {};

    // ------------------ BASIC VALIDATION ------------------
    if (!amount || amount <= 0 || !receipt) {
      return res.status(400).json({
        error: "Invalid amount or receipt",
      });
    }

    const razorpayKey = functions.config().razorpay?.key;
    const razorpaySecret = functions.config().razorpay?.secret;

    if (!razorpayKey || !razorpaySecret) {
      console.error("❌ Razorpay keys missing in env");
      return res.status(500).json({
        error: "Payment gateway not configured",
      });
    }

    const razorpay = new Razorpay({
      key_id: razorpayKey,
      key_secret: razorpaySecret,
    });

    // ------------------ CREATE RAZORPAY ORDER ------------------
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // paise
      currency: "INR",
      receipt,
      payment_capture: 1,
    });

    return res.status(200).json(order);
  } catch (err) {
    console.error("createRazorpayOrder error:", err);
    return res.status(500).json({
      error: "Failed to create Razorpay order",
    });
  }
});
