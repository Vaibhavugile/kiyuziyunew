/* eslint-disable no-console */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { v4: uuidv4 } = require("uuid");

admin.initializeApp();
const db = admin.firestore();

// IMPORTANT: Replace with env variables in production
const MSG91_AUTH_KEY = "468116AwggRESvY68bf021bP1";
const MY_BUSINESS_NUMBER = "+917897897441";

const WHATSAPP_TEMPLATE_NAME = "invoice_pdf";
const WHATSAPP_TEMPLATE_NAMESPACE = "60cbb046_c34d_4f04_8c62_2cb720ccf00d";
const WHATSAPP_INTEGRATED_NUMBER = "15558299861";

// =========================================================================
// PDF helpers
// =========================================================================
function drawItemsHeader(doc, y) {
  doc
    .fillColor("#aaaaaa")
    .fontSize(10)
    .text("ITEM", 100, y)
    .text("QTY", 300, y, { width: 100, align: "right" })
    .text("PRICE", 400, y, { width: 100, align: "right" })
    .text("TOTAL", 500, y, { width: 50, align: "right" });

  doc
    .strokeColor("#aaaaaa")
    .lineWidth(1)
    .moveTo(50, y + 15)
    .lineTo(550, y + 15)
    .stroke();

  return y + 30; // Return new Y position after header
}

const generateInvoice = async (orderData, filePath) => {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const writeStream = fs.createWriteStream(filePath);
  doc.pipe(writeStream);

  // Document Dimensions for A4: approx width=595, height=842. Margins 50.
  const MAX_ITEMS_Y = 742; // Max Y position before adding a page
  const imageSize = 30;
  const itemHeight = imageSize + 30;

  // --- Invoice Header with Logo ---
  const logoPath = path.join(
    __dirname,
    "src",
    "assets",
    "WhatsApp Image 2025-09-12 at 00.31.52_50c66845.jpg"
  );

  if (fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, 50, 45, { width: 50 });
    } catch (e) {
      console.error("Failed to include local logo image:", e.message);
    }
  }

  doc.fontSize(25).fillColor("#444444").text("INVOICE", 400, 50, { align: "right" });
  doc
    .fontSize(10)
    .text(`Order ID: #${orderData.orderId || orderData.id}`, 400, 75, { align: "right" });
  doc
    .fontSize(10)
    .text(`Date: ${new Date().toLocaleDateString()}`, 400, 90, { align: "right" });

  doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(50, 120).lineTo(550, 120).stroke();

  // --- From / To Information ---
  const customerInfoY = 140;

  // "Invoice To" section
  doc.fontSize(12).fillColor("#000000").text("Invoice To:", 50, customerInfoY);

  const billing = orderData.billingInfo || {};

  doc
    .fontSize(10)
    .text(billing.fullName || "-", 50, customerInfoY + 15)
    .text(`${billing.addressLine1 || ""}, ${billing.city || ""}`, 50, customerInfoY + 30)
    .text(billing.pincode || "-", 50, customerInfoY + 45)
    .text(`Email: ${billing.email || "-"}`, 50, customerInfoY + 60)
    .text(`Phone: ${billing.phoneNumber || "-"}`, 50, customerInfoY + 75);

  // "Invoice For" (Your Business Info)
  doc.fontSize(12).text("Invoice For:", 350, customerInfoY, { align: "right" });
  doc
    .fontSize(10)
    .text("Kiyu-Ziyu", 350, customerInfoY + 15, { align: "right" })
    .text("Hinjewadi", 350, customerInfoY + 30, { align: "right" })
    .text("Pune, Maharashtra, 412101", 350, customerInfoY + 45, { align: "right" })
    .text("Email: kiyuziyujewellery@gmail.com", 350, customerInfoY + 60, { align: "right" })
    .text("Phone: +917897897441", 350, customerInfoY + 75, { align: "right" });

  // Items header
  doc.moveDown().moveDown();
  let itemsY = drawItemsHeader(doc, 250); // Initial header position

  // Items list
  doc.fillColor("#000000");

  const items = Array.isArray(orderData.items) ? orderData.items : [];

  // Pre-fetch all images
  const itemsWithImages = await Promise.all(
    items.map(async (item) => {
      let imageBuffer = null;
      if (item.image) {
        try {
          const resp = await axios.get(item.image, {
            responseType: "arraybuffer",
            timeout: 10000,
          });
          imageBuffer = resp.data;
        } catch (err) {
          console.error(`Failed to download image for ${item.productName}:`, err.message);
        }
      }
      return { ...item, imageBuffer };
    })
  );

  const textX = 100;
  const imageX = 50;

  // Draw all items sequentially now that all images are fetched
  for (const item of itemsWithImages) {
    const qtyNum = Number(item.quantity) || 0;
    const priceNum = Number(item.priceAtTimeOfOrder) || 0;
    const itemTotal = qtyNum * priceNum;

    // Page break check
    if (itemsY + itemHeight > MAX_ITEMS_Y) {
      doc.addPage();
      itemsY = drawItemsHeader(doc, 75);
    }

    // Image
    if (item.imageBuffer) {
      try {
        doc.image(item.imageBuffer, imageX, itemsY, { width: imageSize, height: imageSize });
      } catch (imgErr) {
        console.error(`Failed to render image for ${item.productName}:`, imgErr.message);
      }
    } else {
      doc
        .fillColor("#ff0000")
        .fontSize(8)
        .text("[No Image]", imageX, itemsY + imageSize / 3, {
          width: imageSize,
          align: "center",
        });
    }

    // Product details
    let nextY = itemsY + 5;

    doc.fontSize(10).fillColor("#000000").text(item.productName || "-", textX, nextY);
    nextY += 12;

    doc.fontSize(8).fillColor("#555555").text(`Code: ${item.productCode || "-"}`, textX, nextY);
    nextY += 10;

    // Subcollection Description (if available)
    if (item.subcollectionDescription) {
      doc
        .fontSize(8)
        .fillColor("#333333")
        .text(item.subcollectionDescription, textX, nextY, {
          width: 260,
          align: "left",
        });
      nextY += 12;
      doc.fillColor("#000000");
    }

    // Variation
    if (item.variation) {
      let variationText = "Var: ";
      const parts = [];
      if (item.variation.color) parts.push(`Color: ${item.variation.color}`);
      if (item.variation.size) parts.push(`Size: ${item.variation.size}`);
      variationText += parts.join(" | ");
      doc.fontSize(8).fillColor("#777777").text(variationText, textX, nextY);
      doc.fillColor("#000000");
    }

    doc
      .fontSize(10)
      .text(item.quantity != null ? qtyNum : "-", 300, itemsY + imageSize / 4, {
        width: 100,
        align: "right",
      })
      .text(`₹${priceNum.toFixed(2)}`, 400, itemsY + imageSize / 4, {
        width: 100,
        align: "right",
      })
      .text(`₹${itemTotal.toFixed(2)}`, 500, itemsY + imageSize / 4, {
        width: 50,
        align: "right",
      });

    itemsY += itemHeight;
  }

  // Totals section page break
  const totalsHeaderHeight = 60;
  if (itemsY + 30 + totalsHeaderHeight > MAX_ITEMS_Y) {
    doc.addPage();
    itemsY = 75;
  }

  // Totals
  const totalsY = itemsY + 30;
  doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(350, totalsY).lineTo(550, totalsY).stroke();

  doc
    .fontSize(10)
    .fillColor("#000000")
    .text("Subtotal:", 350, totalsY + 10, { align: "left" })
    .text("Packing:", 350, totalsY + 25, { align: "left" })
    .text("GRAND TOTAL:", 350, totalsY + 50, { align: "left" });

  const subtotal = Number(orderData.subtotal) || 0;
  const shippingFee = Number(orderData.shippingFee) || 0;
  const totalAmount = Number(orderData.totalAmount) || 0;

  doc
    .fontSize(10)
    .fillColor("#000000")
    .text(`₹${subtotal.toFixed(2)}`, 500, totalsY + 10, { align: "right" })
    .text(`₹${shippingFee.toFixed(2)}`, 500, totalsY + 25, { align: "right" });

  doc.strokeColor("#000000").lineWidth(1).moveTo(400, totalsY + 45).lineTo(550, totalsY + 45).stroke();

  doc
    .moveDown()
    .moveDown()
    .moveDown()
    .fontSize(15)
    .text(`₹${totalAmount.toFixed(2)}`, 500, totalsY + 50, { align: "right" })
    .fillColor("#000000");

  // Footer
  doc.moveDown().moveDown().moveDown();
  const footerY = doc.y;
  doc.fillColor("#aaaaaa").text("Thank you for your business!", 50, footerY + 50, {
    align: "center",
    width: 500,
  });

  doc.end();

  await new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });
};

// =========================================================================
// HTTP Function
// =========================================================================
exports.placeorderr = functions.https.onRequest(async (req, res) => {
  let orderSaved = false; // ✅ ADD THIS
  // CORS
  res.set("Access-Control-Allow-Origin", "https://kiyuziyuofficial.com");
  res.set("Vary", "Origin");
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "POST");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Max-Age", "3600");
    return res.status(204).send("");
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const orderData = req.body || {};
  const tempDirectory = os.tmpdir();
  const invoiceFileName = `invoice_${uuidv4()}.pdf`;
  const invoicePath = path.join(tempDirectory, invoiceFileName);

  // Collect item-level problems
  const stockErrors = [];
  const missingItems = [];
  const variationErrors = [];

  try {
    // ======================= Firestore transaction =======================
    await db.runTransaction(async (t) => {
      const productDataMap = new Map();

      for (const item of orderData.items || []) {
        const productRef = db
          .collection("collections")
          .doc(item.collectionId)
          .collection("subcollections")
          .doc(item.subcollectionId)
          .collection("products")
          .doc(item.productId);

        const refPath = productRef.path;
        if (!productDataMap.has(refPath)) {
          productDataMap.set(refPath, { productRef, items: [], productDoc: null });
        }
        productDataMap.get(refPath).items.push(item);
      }

      // Read all unique product docs
      const reads = Array.from(productDataMap.values()).map((e) => t.get(e.productRef));
      const docs = await Promise.all(reads);
      let i = 0;
      for (const entry of productDataMap.values()) {
        entry.productDoc = docs[i++];
      }

      const updates = [];

      for (const entry of productDataMap.values()) {
        const { productDoc, productRef, items } = entry;

        if (!productDoc.exists) {
          items.forEach((it) => {
            missingItems.push({
              productId: it.productId,
              productCode: it.productCode || "N/A",
              productName: it.productName || "Unknown",
            });
          });
          continue;
        }

        const productData = productDoc.data();
        let updateData = {};

        const isVariationProduct =
          Array.isArray(productData.variations) && productData.variations.length > 0;

        if (isVariationProduct) {
          // Variation products
          let updatedVariations = [...productData.variations];

          for (const it of items) {
            const qty = Number(it.quantity);
            let variationFound = false;

            if (it.variation) {
              updatedVariations = updatedVariations.map((v) => {
                const isMatch =
                  ((v.color ?? "").trim() === (it.variation.color ?? "").trim()) &&
                  ((v.size ?? "").trim() === (it.variation.size ?? "").trim());

                if (isMatch) {
                  variationFound = true;
                  const currentQuantity = Number(v.quantity) || 0;
                  const newQuantity = currentQuantity - qty;

                  if (newQuantity < 0) {
                    stockErrors.push({
                      productId: it.productId,
                      productCode: productData.productCode || "N/A",
                      productName: it.productName || "Unknown",
                      variation: { color: v.color ?? "", size: v.size ?? "" },
                      requested: qty,
                      available: currentQuantity,
                    });
                    return v; // keep original if insufficient
                  }

                  return { ...v, quantity: newQuantity };
                }
                return v;
              });
            }

            if (it.variation && !variationFound) {
              variationErrors.push({
                productId: it.productId,
                productCode: productData.productCode || "N/A",
                productName: it.productName || "Unknown",
                variation: {
                  color: it.variation.color ?? "",
                  size: it.variation.size ?? "",
                },
              });
            }
          }

          // Only apply stock update if this product has no errors
          const anyErrorForThisProduct =
            stockErrors.some((e) => items.some((it) => it.productId === e.productId)) ||
            variationErrors.some((e) => items.some((it) => it.productId === e.productId)) ||
            missingItems.some((e) => items.some((it) => it.productId === e.productId));

          if (!anyErrorForThisProduct) {
            updateData = { variations: updatedVariations };
          }
        } else {
          // Simple products
          const currentQuantity = Number(productData.quantity) || 0;
          const totalQty = items.reduce((sum, it) => sum + Number(it.quantity), 0);
          const newQuantity = currentQuantity - totalQty;

          if (newQuantity < 0) {
            const anyItem = items[0] || {};
            stockErrors.push({
              productId: anyItem.productId,
              productCode: productData.productCode || "N/A",
              productName: anyItem.productName || "Unknown",
              variation: null,
              requested: totalQty,
              available: currentQuantity,
            });
          } else {
            updateData = { quantity: newQuantity };
          }
        }

        const anyErrorForThisProduct =
          stockErrors.some((e) => items.some((it) => it.productId === e.productId)) ||
          variationErrors.some((e) => items.some((it) => it.productId === e.productId)) ||
          missingItems.some((e) => items.some((it) => it.productId === e.productId));

        if (Object.keys(updateData).length > 0 && !anyErrorForThisProduct) {
          updates.push({ ref: productRef, data: updateData });
        }
      }

      // Abort on any validation failures
      if (stockErrors.length > 0 || variationErrors.length > 0 || missingItems.length > 0) {
        throw new Error("ORDER_VALIDATION_FAILED");
      }

      // Save order
      const orderRef = db.collection("orders").doc();
      orderData.orderId = orderRef.id;

      t.set(orderRef, {
        ...orderData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "Placed",
      });

      // Apply stock updates
      updates.forEach((u) => t.update(u.ref, u.data));
    });
    orderSaved = true;


    // ======================= Enrich items (subcollection descriptions) =======================
    try {
      const subKeysSet = new Set();
      (orderData.items || []).forEach((it) =>
        subKeysSet.add(`${it.collectionId}__${it.subcollectionId}`)
      );

      const subFetchPromises = Array.from(subKeysSet).map(async (key) => {
        const [collectionId, subcollectionId] = key.split("__");
        const subDoc = await db
          .collection("collections")
          .doc(collectionId)
          .collection("subcollections")
          .doc(subcollectionId)
          .get();
        return { key, data: subDoc.exists ? subDoc.data() : null };
      });
      const subResults = await Promise.all(subFetchPromises);
      const subMap = new Map(subResults.filter((r) => r.data).map((r) => [r.key, r.data]));

      orderData.items = (orderData.items || []).map((it) => {
        const desc = subMap.get(`${it.collectionId}__${it.subcollectionId}`)?.description;
        return { ...it, subcollectionDescription: desc ? String(desc) : "" };
      });
    } catch (e) {
      console.error("Failed fetching subcollection descriptions:", e.message);
      orderData.items = (orderData.items || []).map((it) => ({
        ...it,
        subcollectionDescription: "",
      }));
    }

    // ======================= Generate and upload invoice PDF =======================
    await generateInvoice(orderData, invoicePath);

    const bucket = admin.storage().bucket();
    const destination = `invoices/${invoiceFileName}`;

    // Add Firebase-style download token so the URL is fetchable
    const downloadToken = uuidv4();
    await bucket.upload(invoicePath, {
      destination,
      metadata: {
        contentType: "application/pdf",
        metadata: { firebaseStorageDownloadTokens: downloadToken },
      },
    });

    // IMPORTANT: single-line URL — no stray whitespace/newlines
    const mediaUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(
      destination
    )}?alt=media&token=${downloadToken}`;

    // ======================= WhatsApp (MSG91) — best effort =======================
    const bi = orderData.billingInfo || {};
    const toNumbers = [bi.phoneNumber, MY_BUSINESS_NUMBER].filter(Boolean).map((n) =>
      String(n).trim()
    );

    const messagePayload = {
      integrated_number: WHATSAPP_INTEGRATED_NUMBER,
      content_type: "template",
      payload: {
        messaging_product: "whatsapp",
        type: "template",
        template: {
          name: WHATSAPP_TEMPLATE_NAME,
          language: { code: "en", policy: "deterministic" },
          namespace: WHATSAPP_TEMPLATE_NAMESPACE,
          to_and_components: [
            {
              to: toNumbers,
              components: {
                header_1: { filename: invoiceFileName, type: "document", value: mediaUrl },
                body_1: { type: "text", value: bi.fullName || "-" },
              },
            },
          ],
        },
      },
    };

    let whatsappSent = false;
    try {
      await axios.post(
        "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
        messagePayload,
        {
          headers: { authkey: MSG91_AUTH_KEY, "Content-Type": "application/json" },
          timeout: 15000,
        }
      );
      whatsappSent = true;
    } catch (err) {
      // Do NOT fail the order if WhatsApp fails
      console.error("MSG91 send failed", {
        status: err.response?.status,
        data: err.response?.data,
        message: err.message,
      });
    } finally {
      // Cleanup temp file
      try {
        if (fs.existsSync(invoicePath)) fs.unlinkSync(invoicePath);
      } catch (e) {
        console.error("Temp cleanup failed:", e.message);
      }
    }

    // ======================= Response =======================
    return res.status(200).json({
      message: "Order placed.",
      orderId: orderData.orderId,
      invoiceSentOnWhatsApp: whatsappSent,
      invoiceUrl: mediaUrl,
    });
  } catch (err) {
    // Cleanup temp on failure as well
    try {
      if (fs.existsSync(invoicePath)) fs.unlinkSync(invoicePath);
    } catch (e) {
      console.error("Temp cleanup failed:", e.message);
    }

    console.error("Error processing order:", err.message);

// 🔥 CRITICAL FIX: order already saved → NEVER fail
if (orderSaved) {
  return res.status(200).json({
    message: "Order placed successfully",
    orderId: orderData.orderId,
    note: "Invoice or WhatsApp notification may be delayed",
  });
}

// 🔴 Validation failure → NO stock reduced
if (err.message === "ORDER_VALIDATION_FAILED") {
  return res.status(409).json({
    error: "Some items cannot be fulfilled.",
    missingItems,
    variationErrors,
    stockErrors,
  });
}

// 🔴 Real failure before order save
return res.status(500).json({
  error: "Failed to process order",
});

  }
});
