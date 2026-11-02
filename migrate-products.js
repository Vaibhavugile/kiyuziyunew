/**
 * Firebase catalog cleanup + image optimization migration.
 *
 * SAFE DEFAULT:
 *   node migrate-products.js --concurrency=20 --batch-size=400
 *
 * This scans ALL catalog products and writes a dry-run plan only.
 * It does not modify Firestore or Storage.
 *
 * After reviewing the plan:
 *   node migrate-products.js --apply --plan=migration-reports/product-migration-PLAN.json --concurrency=20 --batch-size=400
 *
 * To resume an interrupted apply, run the SAME command again with --resume.
 *
 * Required:
 *   npm install firebase-admin sharp
 *   GOOGLE_APPLICATION_CREDENTIALS=C:\path\serviceAccountKey.json
 *   FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
 *
 * Product is deleted if created before 2026-10-01 00:00 IST and has no positive variation quantity, OR if both:
 *   - main quantity <= 0
 *   - every variation quantity <= 0
 *
 * Retained products receive missing thumbnail (400px WebP) and medium
 * (800px WebP) URL fields. Original and gallery images are preserved.
 *
 * IMPORTANT:
 * - Only catalog paths under collections/{collection}/subcollections/{subcollection}/
 *   products and appProducts are scanned.
 * - Matching dropshipperProducts/{uid}/products/{productId} and
 *   storeProducts/{uid}/products/{productId} documents are deleted for deleted products.
 * - Storage objects referenced by ANY currently retained catalog product are preserved.
 * - Keep the service account key private and out of source control.
 */

"use strict";

const { applicationDefault, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(name);
const getArg = (name, fallback) => {
  const prefix = `${name}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
};

const APPLY = hasFlag("--apply");
const RESUME = hasFlag("--resume");
const CONCURRENCY = Math.min(25, Math.max(1, Number.parseInt(getArg("--concurrency", "20"), 10) || 20));
const BATCH_SIZE = Math.min(1000, Math.max(1, Number.parseInt(getArg("--batch-size", "400"), 10) || 400));
const CUTOFF = new Date("2026-10-01T00:00:00+05:30");
const REPORT_DIR = path.join(process.cwd(), "migration-reports");
const PLAN_ARG = getArg("--plan", "");
const BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET;

if (!BUCKET_NAME) {
  console.error("ERROR: Set FIREBASE_STORAGE_BUCKET before running.");
  process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to your service-account JSON path.");
  process.exit(1);
}
if (APPLY && !PLAN_ARG) {
  console.error("ERROR: --apply requires --plan=<dry-run-plan.json>. Run a dry run first.");
  process.exit(1);
}

const app = getApps().length ? getApps()[0] : initializeApp({
  credential: applicationDefault(),
  storageBucket: BUCKET_NAME,
});
const db = getFirestore(app);
const bucket = getStorage(app).bucket(BUCKET_NAME);

function parseDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}
function qty(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}
function stockStatus(data) {
  const variations = Array.isArray(data.variations) ? data.variations : [];
  const variationQuantities = variations.map((v) => qty(v?.quantity));
  const mainQty = qty(data.quantity);
  const hasPositiveVariation = variationQuantities.some((n) => n > 0);
  return {
    mainQty,
    variationQuantities,
    hasPositiveVariation,
    available: mainQty > 0 || hasPositiveVariation,
  };
}
function imageUrls(data) {
  return [...new Set([
    data.image,
    ...(Array.isArray(data.additionalImages) ? data.additionalImages : []),
    data.thumbnail,
    data.medium,
  ].filter((v) => typeof v === "string" && v.trim()))];
}
function storagePathFromUrl(url) {
  if (typeof url !== "string" || !url.trim()) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "gs:") {
      if (parsed.hostname && parsed.hostname !== bucket.name) return null;
      return decodeURIComponent(parsed.pathname.replace(/^\/+/, "")) || null;
    }
    if (parsed.hostname !== "firebasestorage.googleapis.com") return null;
    const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if (!match || decodeURIComponent(match[1]) !== bucket.name) return null;
    return decodeURIComponent(match[2]) || null;
  } catch {
    return null;
  }
}
function classify(data) {
  const createdAt = parseDate(data.createdAt);
  const stock = stockStatus(data);
  // Protect products that have any positive variation quantity, even if old.
  // Per the reviewed plan, old products with no positive variation remain eligible
  // for deletion (including products with no variations and positive mainQty).
  if (createdAt && createdAt < CUTOFF && !stock.hasPositiveVariation) {
    return { action: "DELETE", reason: "created before 2026-10-01 00:00 IST", createdAt, stock };
  }
  if (!stock.available) {
    return { action: "DELETE", reason: "main quantity and all variation quantities are zero or less", createdAt, stock };
  }
  return {
    action: "OPTIMIZE",
    reason: createdAt ? "in stock" : "in stock; createdAt missing/unreadable, preserved",
    createdAt,
    stock,
  };
}
async function mapLimit(items, concurrency, worker) {
  let next = 0;
  const results = new Array(items.length);
  async function run() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { error: error?.stack || error?.message || String(error) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}
async function discoverCatalog() {
  const records = [];
  const collections = await db.collection("collections").get();
  for (const collectionDoc of collections.docs) {
    const subcollections = await collectionDoc.ref.collection("subcollections").get();
    for (const subcollectionDoc of subcollections.docs) {
      for (const destination of ["products", "appProducts"]) {
        const products = await subcollectionDoc.ref.collection(destination).get();
        for (const productDoc of products.docs) {
          const data = productDoc.data();
          const decision = classify(data);
          records.push({
            path: productDoc.ref.path,
            id: productDoc.id,
            productName: data.productName || "",
            productCode: data.productCode || "",
            collectionId: collectionDoc.id,
            subcollectionId: subcollectionDoc.id,
            destination,
            action: decision.action,
            reason: decision.reason,
            createdAt: decision.createdAt?.toISOString() || null,
            stock: decision.stock,
            imageUrls: imageUrls(data),
          });
        }
      }
    }
  }
  return records;
}
function atomicJsonWrite(filePath, value) {
  const temp = `${filePath}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, filePath);
}
function safeName(value) {
  return String(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}
async function createPlan() {
  const records = await discoverCatalog();
  const retainedStoragePaths = new Set();
  for (const record of records) {
    if (record.action !== "OPTIMIZE") continue;
    for (const url of record.imageUrls) {
      const objectPath = storagePathFromUrl(url);
      if (objectPath) retainedStoragePaths.add(objectPath);
    }
  }
  const counts = records.reduce((acc, item) => {
    acc[item.action] = (acc[item.action] || 0) + 1;
    return acc;
  }, {});
  const plan = {
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    bucket: bucket.name,
    cutoff: CUTOFF.toISOString(),
    discoveredCount: records.length,
    counts,
    retainedStoragePaths: [...retainedStoragePaths],
    records,
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const file = path.join(REPORT_DIR, `product-migration-plan-${Date.now()}.json`);
  atomicJsonWrite(file, plan);
  const csvFile = file.replace(/\.json$/i, ".csv");
  const columns = ["path", "id", "productCode", "productName", "destination", "createdAt", "action", "reason", "mainQty", "variationQuantities", "imageCount"];
  const rows = records.map((r) => [
    r.path, r.id, r.productCode, r.productName, r.destination, r.createdAt, r.action, r.reason,
    r.stock.mainQty, r.stock.variationQuantities.join("|"), r.imageUrls.length,
  ]);
  const csv = [columns, ...rows].map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  fs.writeFileSync(csvFile, csv);
  console.log(`\nDiscovered ${records.length} catalog products.`);
  console.log("Planned actions:", counts);
  console.log(`Plan JSON: ${file}`);
  console.log(`Plan CSV:  ${csvFile}`);
  console.log("\nDry run complete. No Firestore or Storage changes were made.");
}
async function findRelatedStoreDocs(productId) {
  const snap = await db.collectionGroup("products").where("productId", "==", productId).get();
  return snap.docs
    .filter((doc) => ["dropshipperProducts", "storeProducts"].includes(doc.ref.path.split("/")[0]))
    .map((doc) => doc.ref);
}
async function deleteStorageImages(urls, retainedPaths) {
  const results = [];
  const uniquePaths = [...new Set(urls.map(storagePathFromUrl).filter(Boolean))];
  for (const objectPath of uniquePaths) {
    if (retainedPaths.has(objectPath)) {
      results.push({ objectPath, deleted: false, reason: "referenced by a retained catalog product" });
      continue;
    }
    try {
      await bucket.file(objectPath).delete({ ignoreNotFound: true });
      results.push({ objectPath, deleted: true });
    } catch (error) {
      results.push({ objectPath, deleted: false, reason: error.message });
    }
  }
  return results;
}
async function uploadWebp(buffer, objectPath, width, quality) {
  const output = await sharp(buffer)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality, effort: 3 })
    .toBuffer();
  const token = crypto.randomUUID();
  await bucket.file(objectPath).save(output, {
    resumable: false,
    metadata: {
      contentType: "image/webp",
      cacheControl: "public,max-age=31536000,immutable",
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
  return { url, bytes: output.length };
}
async function optimizeRecord(record) {
  const ref = db.doc(record.path);
  const snap = await ref.get();
  if (!snap.exists) return { skipped: true, reason: "product no longer exists" };
  const data = snap.data();
  const current = classify(data);
  if (current.action !== "OPTIMIZE") {
    return { skipped: true, reason: `current product status changed to ${current.action}; create a fresh plan` };
  }
  if (data.thumbnail && data.medium) return { skipped: true, reason: "thumbnail and medium already exist" };
  if (!data.image) return { skipped: true, reason: "no main image URL" };
  const objectPath = storagePathFromUrl(data.image);
  if (!objectPath) return { skipped: true, reason: "main image is not in the configured Firebase bucket" };
  const [buffer] = await bucket.file(objectPath).download();
  const base = `optimized-products/${record.collectionId}/${record.subcollectionId}/${record.id}`;
  const [thumb, medium] = await Promise.all([
    data.thumbnail ? Promise.resolve({ url: data.thumbnail, bytes: null }) :
      uploadWebp(buffer, `${base}/thumbnail.webp`, 400, 70),
    data.medium ? Promise.resolve({ url: data.medium, bytes: null }) :
      uploadWebp(buffer, `${base}/medium.webp`, 800, 75),
  ]);
  const update = {};
  if (!data.thumbnail) update.thumbnail = thumb.url;
  if (!data.medium) update.medium = medium.url;
  await ref.update(update);
  return {
    updatedFields: Object.keys(update),
    thumbnailBytes: thumb.bytes,
    mediumBytes: medium.bytes,
    originalPreserved: true,
  };
}
async function deleteRecord(record, retainedPaths) {
  const ref = db.doc(record.path);
  const snap = await ref.get();
  if (snap.exists) {
    const current = classify(snap.data());
    if (current.action !== "DELETE") {
      return { skipped: true, reason: "product is no longer eligible for deletion; create a fresh plan" };
    }
  }
  const related = await findRelatedStoreDocs(record.id);
  // Delete matching mirror documents in parallel; deletes are idempotent.
  await Promise.all(related.map((docRef) => docRef.delete()));
  const imageResults = await deleteStorageImages(record.imageUrls, retainedPaths);
  if (snap.exists) await ref.delete();
  return {
    deletedProductPath: record.path,
    deletedRelatedPaths: related.map((r) => r.path),
    imageResults,
    deletedImageCount: imageResults.filter((r) => r.deleted).length,
  };
}
function loadCheckpoint(file) {
  if (!RESUME || !fs.existsSync(file)) return { completed: {}, results: [] };
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { throw new Error(`Checkpoint is unreadable: ${file}`); }
}
async function applyPlan() {
  if (!fs.existsSync(PLAN_ARG)) throw new Error(`Plan file not found: ${PLAN_ARG}`);
  const plan = JSON.parse(fs.readFileSync(PLAN_ARG, "utf8"));
  if (plan.schemaVersion !== 2) throw new Error("Unsupported plan format. Generate a fresh dry-run plan with this script.");
  if (plan.bucket !== bucket.name) throw new Error(`Plan bucket ${plan.bucket} does not match configured bucket ${bucket.name}.`);
  const currentRecords = await discoverCatalog();
  const currentByPath = new Map(currentRecords.map((r) => [r.path, r]));
  const retainedPaths = new Set();
  for (const record of currentRecords) {
    if (record.action !== "OPTIMIZE") continue;
    for (const url of record.imageUrls) {
      const p = storagePathFromUrl(url);
      if (p) retainedPaths.add(p);
    }
  }
  const checkpointFile = `${PLAN_ARG}.checkpoint.json`;
  const checkpoint = loadCheckpoint(checkpointFile);
  const pending = plan.records.filter((r) => !checkpoint.completed[r.path]);
  console.log(`Plan contains ${plan.records.length} products; ${pending.length} remain.`);
  console.log(`Current retained image references: ${retainedPaths.size}`);
  console.log(`Batch size: ${BATCH_SIZE}; concurrency: ${CONCURRENCY}`);
  for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
    const batch = pending.slice(offset, offset + BATCH_SIZE);
    console.log(`\nBatch ${Math.floor(offset / BATCH_SIZE) + 1}: ${batch.length} products`);
    const results = await mapLimit(batch, CONCURRENCY, async (record) => {
      const current = currentByPath.get(record.path);
      if (!current) {
        // Product disappeared since plan; clean related mirror docs and planned images safely.
        if (record.action === "DELETE") {
          const related = await findRelatedStoreDocs(record.id);
          await Promise.all(related.map((r) => r.delete()));
          const images = await deleteStorageImages(record.imageUrls, retainedPaths);
          return { path: record.path, action: record.action, result: { alreadyMissing: true, deletedRelatedPaths: related.map((r) => r.path), imageResults: images } };
        }
        return { path: record.path, action: record.action, result: { skipped: true, reason: "product no longer exists" } };
      }
      if (current.action !== record.action) {
        return { path: record.path, action: record.action, result: { skipped: true, reason: `classification changed to ${current.action}; fresh plan required` } };
      }
      const result = record.action === "DELETE"
        ? await deleteRecord(current, retainedPaths)
        : await optimizeRecord(current);
      return { path: record.path, action: record.action, result };
    });
    for (let i = 0; i < batch.length; i++) {
      const row = results[i];
      if (!row.error) {
        // Skips caused by changed classification are not marked complete; a new plan is needed.
        const changed = row.result?.reason?.includes("fresh plan");
        if (!changed) checkpoint.completed[row.path] = new Date().toISOString();
      }
      checkpoint.results.push(row);
    }
    atomicJsonWrite(checkpointFile, checkpoint);
    const completedCount = Object.keys(checkpoint.completed).length;
    console.log(`Checkpoint saved. Completed: ${completedCount}/${plan.records.length}. Errors this batch: ${results.filter((r) => r.error).length}`);
  }
  const summary = {
    generatedAt: new Date().toISOString(),
    mode: "APPLY",
    plan: path.resolve(PLAN_ARG),
    bucket: bucket.name,
    planCount: plan.records.length,
    completedCount: Object.keys(checkpoint.completed).length,
    remainingCount: plan.records.length - Object.keys(checkpoint.completed).length,
    checkpoint: checkpointFile,
    results: checkpoint.results,
  };
  const reportFile = path.join(REPORT_DIR, `product-migration-apply-${Date.now()}.json`);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  atomicJsonWrite(reportFile, summary);
  console.log(`\nApply report: ${reportFile}`);
  console.log(`Checkpoint: ${checkpointFile}`);
  console.log(`Finished. Remaining/unresolved: ${summary.remainingCount}`);
  if (summary.remainingCount > 0) {
    console.log("Resolve errors or changed product classifications, then rerun the same command with --resume.");
  }
}
async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  console.log(`Project bucket: ${bucket.name}`);
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN (no changes)"}`);
  console.log(`Concurrency: ${CONCURRENCY} worker(s), max 25`);
  console.log(`Batch size: ${BATCH_SIZE} products`);
  console.log(`Cutoff: ${CUTOFF.toISOString()} (2026-10-01 00:00 IST)`);
  if (APPLY) await applyPlan();
  else await createPlan();
}
main().catch((error) => {
  console.error("\nMigration failed:", error?.stack || error);
  process.exitCode = 1;
});
