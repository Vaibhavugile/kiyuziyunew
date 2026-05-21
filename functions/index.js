const functions = require("firebase-functions");
const express = require("express");
const prerender = require("prerender-node");

const app = express();

/* =========================
   PRERENDER
========================= */

prerender.set(
  "prerenderToken",
  "AIh9BKbpKo83iR6IjQoR"
);

app.use(prerender);

/* =========================
   TEST ROUTE
========================= */

app.get("/", (req, res) => {
  res.send("Prerender working");
});

/* =========================
   EXPORT
========================= */

exports.app = functions.https.onRequest(app);