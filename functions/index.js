// functions/index.js
const functions = require("firebase-functions");
const fs = require("fs");
const os = require("os");
const path = require("path");
const admin = require("firebase-admin");
const axios = require("axios");
const PDFDocument = require("pdfkit");

admin.initializeApp();
const db = admin.firestore();
const imageSize = 30;

/* -------------------------------- Helpers -------------------------------- */

function drawItemsHeader(doc, y) {
  doc.fillColor("#aaaaaa").fontSize(10)
    .text("No.", 50, y)
    .text("ITEM", 90, y)
    .text("QTY", 320, y, { width: 80, align: "right" })
    .text("PRICE", 410, y, { width: 80, align: "right" })
    .text("TOTAL", 500, y, { width: 50, align: "right" });

  doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(45, y + 15)
    .lineTo(555, y + 15).stroke();

  return y + 30;
}

function drawPlaceholder(doc, x, y, size) {
  doc.save();
  doc.lineWidth(1).strokeColor("#dddddd").fillColor("#f4f4f5");
  doc.rect(x, y, size, size).fillAndStroke();
  doc.fillColor("#9ca3af").fontSize(7)
    .text("[No Image]", x, y + size / 2 - 4, { width: size, align: "center" });
  doc.restore();
}

// Only PNG/JPEG are supported by pdfkit
function isPngOrJpeg(buf) {
  if (!buf || buf.length < 4) return false;
  const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47; // 89 50 4E 47
  const jpg = buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF; // FF D8 FF
  return png || jpg;
}

async function fetchProductDescriptionFromPath(productLocation) {
  if (!productLocation || !productLocation.productId) return null;
  const { collectionId, subcollectionId, productId } = productLocation;
  try {
    const productRef = db
      .collection("collections")
      .doc(collectionId)
      .collection("subcollections")
      .doc(subcollectionId)
      .collection("products")
      .doc(productId);

    const productSnap = await productRef.get();
    if (productSnap.exists) {
      const pdata = productSnap.data();
      if (pdata && pdata.description) {
        return String(pdata.description).trim();
      }

      const candidates = ["description", "descriptions", "meta", "meta_description"];
      for (const name of candidates) {
        try {
          const collSnap = await productRef.collection(name).limit(1).get();
          if (!collSnap.empty) {
            const d = collSnap.docs[0].data();
            if (d) {
              if (d.text) return String(d.text).trim();
              if (d.description) return String(d.description).trim();
              const joined = Object.values(d).filter(Boolean).join(" ");
              if (joined) return joined.slice(0, 800);
            }
          }
        } catch (_) {
          // ignore and try next
        }
      }
    }
  } catch (err) {
    console.error("fetchProductDescriptionFromPath error:", err.message);
  }
  return null;
}

/* ---------------------------- PDF Generation ----------------------------- */

async function generateInvoice(orderData, filePath) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const writeStream = fs.createWriteStream(filePath);
  doc.pipe(writeStream);

  const MAX_ITEMS_Y = 742;
  const baseItemHeight = imageSize + 30;

  // Logo (optional)
  const logoPath = path.join(__dirname, "src", "assets", "WhatsApp Image 2025-09-12 at 00.31.52_50c66845.jpg");
  if (fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, 50, 45, { width: 50 });
    } catch (err) {
      console.error("Failed to render local logo image:", err.message);
    }
  }

  doc.fontSize(25).fillColor("#444444").text("INVOICE", 400, 50, { align: "right" });
  doc.fontSize(10).text(`Order ID: #${orderData.orderId || orderData.id}`, 400, 75, { align: "right" });
  doc.fontSize(10).text(`Date: ${new Date().toLocaleDateString()}`, 400, 90, { align: "right" });

  doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(50, 120).lineTo(550, 120).stroke();

  // From / To
  const customerInfoY = 140;
  doc.fontSize(12).fillColor("#000000").text("Invoice To:", 50, customerInfoY);

  const billing = orderData.billingInfo || {};
  doc
    .fontSize(10)
    .text(billing.fullName || "-", 50, customerInfoY + 15)
    .text(`${billing.addressLine1 || ""}, ${billing.city || ""}`, 50, customerInfoY + 30)
    .text(billing.pincode || "-", 50, customerInfoY + 45)
    .text(`Email: ${billing.email || "-"}`, 50, customerInfoY + 60)
    .text(`Phone: ${billing.phoneNumber || "-"}`, 50, customerInfoY + 75);

  doc.fontSize(12).text("Invoice For:", 350, customerInfoY, { align: "right" });
  doc
    .fontSize(10)
    .text("Your Company Name", 350, customerInfoY + 15, { align: "right" })
    .text("Your Address Line 1", 350, customerInfoY + 30, { align: "right" })
    .text("City, State, Pincode", 350, customerInfoY + 45, { align: "right" })
    .text("Email: your_email@example.com", 350, customerInfoY + 60, { align: "right" })
    .text("Phone: Your Phone Number", 350, customerInfoY + 75, { align: "right" });

  // Items header
  doc.moveDown().moveDown();
  let itemsY = drawItemsHeader(doc, 250);
  doc.fillColor("#000000");

  const items = Array.isArray(orderData.items) ? orderData.items : [];

  // Pre-fetch images AND descriptions
  const itemsWithExtras = await Promise.all(
    items.map(async (item) => {
      // Fetch image buffer (hint server for png/jpeg)
      let imageBuffer = null;
      if (item.image) {
        try {
        const sharp = require("sharp");

const resp = await axios.get(item.image, {
  responseType: "arraybuffer",
  timeout: 15000,
});

const originalBuffer = Buffer.from(resp.data);

// Convert ANY format → JPEG for PDFKit
imageBuffer = await sharp(originalBuffer)
  .jpeg({ quality: 80 })
  .toBuffer();

        } catch (err) {
          console.error(`Failed to download image for ${item.productName}:`, err.message);
        }
      }

      let finalDescription = null;
      if (item.description && String(item.description).trim()) {
        finalDescription = String(item.description).trim();
      } else if (item.productId && item.collectionId && item.subcollectionId) {
        const desc = await fetchProductDescriptionFromPath({
          collectionId: item.collectionId,
          subcollectionId: item.subcollectionId,
          productId: item.productId,
        });
        if (desc) finalDescription = desc;
      }
      if (!finalDescription && item.subcollectionDescription) {
        finalDescription = String(item.subcollectionDescription).trim();
      }

      return { ...item, imageBuffer, finalDescription };
    })
  );

  let index = 0;
  let totalQuantity = 0;

  for (const item of itemsWithExtras) {
    index += 1;
    const qty = Number(item.quantity || 0);
    totalQuantity += qty;
    const price = Number(item.priceAtTimeOfOrder || 0);
    const itemTotal = qty * price;

    let dynamicExtra = 0;
    if (item.variation) dynamicExtra += 10;
    if (item.finalDescription && item.finalDescription.length > 0) {
      const approxLines = Math.ceil(item.finalDescription.length / 60);
      dynamicExtra += approxLines * 8 + 6;
    }
    const itemHeight = baseItemHeight + dynamicExtra;

    // PAGE BREAK
    if (itemsY + itemHeight > MAX_ITEMS_Y) {
      doc.addPage();
      itemsY = drawItemsHeader(doc, 75);
    }

    // Image or placeholder
    const imageX = 50;
    const textX = 100;

    if (item.imageBuffer && isPngOrJpeg(item.imageBuffer)) {
      try {
        doc.image(item.imageBuffer, imageX, itemsY, { width: imageSize, height: imageSize });
      } catch (imgErr) {
        console.error(`Failed to render image for ${item.productName}:`, imgErr.message);
        drawPlaceholder(doc, imageX, itemsY, imageSize);
      }
    } else {
      if (item.imageBuffer && !isPngOrJpeg(item.imageBuffer)) {
        console.error(`Unsupported image format for ${item.productName || "item"} — using placeholder.`);
      }
      drawPlaceholder(doc, imageX, itemsY, imageSize);
    }

    // index number
    doc.fontSize(10).fillColor("#333333").text(`${index}.`, 50, itemsY + 4);

    // product name
    let nextY = itemsY + 4;
    doc.fontSize(10).fillColor("#000000").text(item.productName || "-", textX, nextY, { width: 240 });
    nextY += 12;

    // product code
    doc.fontSize(8).fillColor("#555555").text(`Code: ${item.productCode || "-"}`, textX, nextY);
    nextY += 10;

    // variation
    if (item.variation && (item.variation.color || item.variation.size)) {
      let variationText = "";
      if (item.variation.color) variationText += `Color: ${item.variation.color}`;
      if (item.variation.size) variationText += (variationText ? " | " : "") + `Size: ${item.variation.size}`;
      doc.fontSize(8).fillColor("#777777").text(variationText, textX, nextY);
      nextY += 10;
    }

    // description (if any)
    if (item.finalDescription && item.finalDescription.length) {
      doc.fontSize(8).fillColor("#666666");
      doc.text(item.finalDescription, textX, nextY, { width: 280 });
      const approxLines = Math.ceil(item.finalDescription.length / 60);
      nextY += approxLines * 8 + 6;
      doc.fillColor("#000000");
    }

    // qty / price / total
    doc.fontSize(10)
      .text(Number.isFinite(qty) ? qty : "-", 320, itemsY + imageSize / 4, { width: 80, align: "right" })
      .text(`₹${price.toFixed(2)}`, 410, itemsY + imageSize / 4, { width: 80, align: "right" })
      .text(`₹${itemTotal.toFixed(2)}`, 500, itemsY + imageSize / 4, { width: 50, align: "right" });

    // advance cursor
    itemsY += Math.max(itemHeight, (nextY - itemsY) + 8);
  }

  // safety before totals
  const totalsHeaderHeight = 80;
  if (itemsY + 30 + totalsHeaderHeight > MAX_ITEMS_Y) {
    doc.addPage();
    itemsY = 75;
  }

  // print total quantity
  const totalQtyY = itemsY + 10;
  doc.fontSize(10).fillColor("#000000").text(`Total Quantity: ${totalQuantity}`, 350, totalQtyY, { align: "left" });

  // Totals area
  const totalsY = totalQtyY + 30;
  doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(350, totalsY).lineTo(550, totalsY).stroke();

  // Labels
  doc.fontSize(10).fillColor("#000000")
    .text("Subtotal:", 350, totalsY + 10, { align: "left" })
    .text("Packing:", 350, totalsY + 25, { align: "left" })
    .text("GRAND TOTAL:", 350, totalsY + 50, { align: "left" });

  const subtotal = Number(orderData.subtotal || 0);
  const shipping = Number(orderData.shippingFee || 0);
  const grand = Number(orderData.totalAmount || 0);

  // Values
  doc.fontSize(10).fillColor("#000000")
    .text(`₹${subtotal.toFixed(2)}`, 500, totalsY + 10, { align: "right" })
    .text(`₹${shipping.toFixed(2)}`, 500, totalsY + 25, { align: "right" });

  doc.strokeColor("#000000").lineWidth(1).moveTo(400, totalsY + 45).lineTo(550, totalsY + 45).stroke();

  doc.moveDown().moveDown().moveDown().fontSize(15)
    .text(`₹${grand.toFixed(2)}`, 500, totalsY + 50, { align: "right" })
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
}

/* ---------------------------- HTTPS Entrypoint ---------------------------- */

exports.generateInvoiceForPrintt = functions.https.onRequest(async (req, res) => {
const allowedOrigins = [
    "https://kiyuziyuofficial.com",
    "https://www.kiyuziyuofficial.com",
  ];

  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }

  res.set("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "GET");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    res.set("Access-Control-Max-Age", "3600");
    return res.status(204).send("");
  }

  const orderId = req.query.orderId;
  if (!orderId) {
    return res.status(400).send("Missing orderId query parameter.");
  }

  const tempDirectory = os.tmpdir();
  const invoiceFileName = `invoice_${orderId}.pdf`;
  const invoicePath = path.join(tempDirectory, invoiceFileName);

  try {
    const orderDoc = await db.collection("orders").doc(orderId).get();

    if (!orderDoc.exists) {
      return res.status(404).send("Order not found.");
    }

    const orderData = { id: orderDoc.id, ...orderDoc.data(), orderId: orderDoc.id };

    await generateInvoice(orderData, invoicePath);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${invoiceFileName}"`);

    const readStream = fs.createReadStream(invoicePath);
    readStream.pipe(res);

    readStream.on("close", () => {
      try {
        fs.unlinkSync(invoicePath);
        console.log(`Cleaned up temporary file: ${invoicePath}`);
      } catch (e) {
        console.error("Cleanup error:", e.message);
      }
    });
    return null;
  } catch (error) {
    console.error("Error generating invoice PDF:", error);
    try {
      if (fs.existsSync(invoicePath)) fs.unlinkSync(invoicePath);
    } catch (e) {
      console.error("Cleanup error:", e.message);
    }
    return res.status(500).send(`Internal Server Error: ${error.message}`);
  }
});
