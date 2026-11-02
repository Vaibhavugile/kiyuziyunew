/**
 * SAFE Firebase product-image re-optimizer.
 *
 * Purpose:
 * - Rebuild the MAIN image (`image`), thumbnail, and medium as optimized WebP.
 * - Keep every generated file within its configured KB limit.
 * - Update Firestore image, thumbnail, and medium URLs to the optimized files.
 * - Never changes product data, stock, pricing, or deletes products.
 *
 * The old large source files are retained in Storage as backups; `originalImage`
 * preserves the first source URL, while `image` points to the optimized main image.
 *
 * Install:
 *   npm install firebase-admin sharp
 *
 * Windows PowerShell:
 *   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\serviceAccountKey.json"
 *   $env:FIREBASE_STORAGE_BUCKET="your-project.firebasestorage.app"
 *
 * Dry run (scans only; no Storage/Firestore writes):
 *   node optimize-product-images.js
 *
 * Apply:
 *   node optimize-product-images-80kb.js --apply --image-kb=100 --thumbnail-kb=50 --medium-kb=100 --concurrency=8
 *
 * Optional:
 *   --image-kb=80        main image maximum (default)
 *   --thumbnail-kb=50    thumbnail maximum
 *   --medium-kb=80       medium image maximum (default)
 *   --concurrency=8      process up to 8 products in parallel (default; max 12)
 *
 * IMPORTANT:
 * The Firestore `image` field is updated to the optimized main WebP URL. The
 * old Storage object is retained as a backup; it is not deleted.
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
const IMAGE_KB = Math.max(20, Number.parseInt(getArg("--image-kb", "100"), 10) || 100);
const THUMBNAIL_KB = Math.max(15, Number.parseInt(getArg("--thumbnail-kb", "50"), 10) || 50);
const MEDIUM_KB = Math.max(20, Number.parseInt(getArg("--medium-kb", "100"), 10) || 100);
const CONCURRENCY = Math.min(12, Math.max(1, Number.parseInt(getArg("--concurrency", "8"), 10) || 8));

// Keep Sharp's internal worker pool modest while multiple products are processed.
sharp.concurrency(2);
sharp.cache({ memory: 96, files: 0, items: 50 });
const REPORT_DIR = path.join(process.cwd(), "image-optimization-reports");
const BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET;

if (!BUCKET_NAME) {
  console.error("ERROR: Set FIREBASE_STORAGE_BUCKET before running.");
  process.exit(1);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to your service-account JSON path.");
  process.exit(1);
}

const app = getApps().length ? getApps()[0] : initializeApp({
  credential: applicationDefault(),
  storageBucket: BUCKET_NAME,
});
const db = getFirestore(app);
const bucket = getStorage(app).bucket(BUCKET_NAME);

function storagePathFromUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const parsed = new URL(value);

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

function safeSegment(value) {
  return String(value || "unknown").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");
}

async function discoverCatalog() {
  const records = [];
  const collectionSnapshot = await db.collection("collections").get();

  for (const collectionDoc of collectionSnapshot.docs) {
    const subcollections = await collectionDoc.ref.collection("subcollections").get();

    for (const subcollectionDoc of subcollections.docs) {
      for (const destination of ["products", "appProducts"]) {
        const products = await subcollectionDoc.ref.collection(destination).get();

        for (const productDoc of products.docs) {
          const data = productDoc.data() || {};
          if (!data.image || !storagePathFromUrl(data.image)) continue;

          records.push({
            ref: productDoc.ref,
            path: productDoc.ref.path,
            id: productDoc.id,
            collectionId: collectionDoc.id,
            subcollectionId: subcollectionDoc.id,
            destination,
            productName: data.productName || "",
            productCode: data.productCode || "",
            originalUrl: data.originalImage || data.image,
            originalImageBackup: data.originalImage || data.image,
            thumbnail: data.thumbnail || "",
            medium: data.medium || "",
          });
        }
      }
    }
  }

  return records;
}

/**
 * Encode a WebP at progressively lower quality and dimensions until it fits.
 * The returned buffer is guaranteed to be <= maxBytes or an error is thrown.
 */
async function encodeUnderLimit(inputBuffer, requestedWidth, maxBytes) {
  let width = requestedWidth;
  const minimumWidth = 160;
  const qualitySteps = [68, 60, 52, 44, 36, 28, 20];

  while (width >= minimumWidth) {
    for (const quality of qualitySteps) {
      const output = await sharp(inputBuffer, { failOn: "none" })
        .rotate()
        .resize({
          width,
          withoutEnlargement: true,
          fit: "inside",
        })
        .webp({
          quality,
          effort: 4,
          smartSubsample: true,
          nearLossless: false,
        })
        .toBuffer();

      if (output.length <= maxBytes) {
        return {
          buffer: output,
          bytes: output.length,
          width,
          quality,
        };
      }
    }

    width = Math.floor(width * 0.85);
  }

  throw new Error(`Could not compress image below ${Math.round(maxBytes / 1024)} KB`);
}

async function uploadOptimized(inputBuffer, objectPath, width, maxBytes) {
  const encoded = await encodeUnderLimit(inputBuffer, width, maxBytes);
  const token = crypto.randomUUID();

  await bucket.file(objectPath).save(encoded.buffer, {
    resumable: false,
    validation: "crc32c",
    metadata: {
      contentType: "image/webp",
      cacheControl: "public,max-age=31536000,immutable",
      metadata: {
        firebaseStorageDownloadTokens: token,
        optimizedMaxBytes: String(maxBytes),
        optimizedWidth: String(encoded.width),
        optimizedQuality: String(encoded.quality),
      },
    },
  });

  const url =
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    `${encodeURIComponent(objectPath)}?alt=media&token=${token}`;

  return {
    url,
    bytes: encoded.bytes,
    width: encoded.width,
    quality: encoded.quality,
    objectPath,
  };
}

async function optimizeOne(record) {
  const originalPath = storagePathFromUrl(record.originalUrl);
  if (!originalPath) {
    return { path: record.path, status: "skipped", reason: "Original image is not in configured Firebase bucket" };
  }

  const [originalBuffer] = await bucket.file(originalPath).download();

  const base =
    `optimized-products/${safeSegment(record.collectionId)}/` +
    `${safeSegment(record.subcollectionId)}/${safeSegment(record.id)}`;

  // All three Firestore image fields now point to optimized WebP files.
  // The main `image` variant is the safe fallback used by the storefront.
  const [mainImage, thumbnail, medium] = await Promise.all([
    uploadOptimized(originalBuffer, `${base}/image.webp`, 800, IMAGE_KB * 1024),
    uploadOptimized(originalBuffer, `${base}/thumbnail.webp`, 350, THUMBNAIL_KB * 1024),
    uploadOptimized(originalBuffer, `${base}/medium.webp`, 600, MEDIUM_KB * 1024),
  ]);

  await record.ref.update({
    // Preserve the first/original source URL so reruns never recompress a WebP.
    originalImage: record.originalImageBackup || record.originalUrl,
    image: mainImage.url,
    thumbnail: thumbnail.url,
    medium: medium.url,
    imageOptimization: {
      format: "webp",
      mainImageMaxBytes: IMAGE_KB * 1024,
      thumbnailMaxBytes: THUMBNAIL_KB * 1024,
      mediumMaxBytes: MEDIUM_KB * 1024,
      optimizedAt: new Date(),
      imageBytes: mainImage.bytes,
      thumbnailBytes: thumbnail.bytes,
      mediumBytes: medium.bytes,
    },
  });

  return {
    path: record.path,
    productCode: record.productCode,
    productName: record.productName,
    status: "updated",
    image: {
      bytes: mainImage.bytes,
      kb: Number((mainImage.bytes / 1024).toFixed(1)),
      width: mainImage.width,
      quality: mainImage.quality,
    },
    thumbnail: {
      bytes: thumbnail.bytes,
      kb: Number((thumbnail.bytes / 1024).toFixed(1)),
      width: thumbnail.width,
      quality: thumbnail.quality,
    },
    medium: {
      bytes: medium.bytes,
      kb: Number((medium.bytes / 1024).toFixed(1)),
      width: medium.width,
      quality: medium.quality,
    },
    oldSourceRetainedAsBackup: true,
  };
}

async function mapLimit(items, concurrency, worker) {
  let next = 0;
  let completed = 0;
  const results = new Array(items.length);

  async function run() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;

      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = {
          path: items[index].path,
          status: "error",
          error: error?.stack || error?.message || String(error),
        };
      }

      const done = ++completed;
      if (done % 10 === 0 || done === items.length) {
        console.log(`Progress: ${done}/${items.length}`);
      }
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(concurrency, items.length) },
    run
  ));

  return results;
}

async function main() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  console.log(`Firebase bucket: ${bucket.name}`);
  console.log(`Mode: ${APPLY ? "APPLY - will overwrite optimized variants and update Firestore" : "DRY RUN - read only"}`);
  console.log(`Main image maximum: ${IMAGE_KB} KB`);
  console.log(`Thumbnail maximum: ${THUMBNAIL_KB} KB`);
  console.log(`Medium maximum: ${MEDIUM_KB} KB`);
  console.log("Generated variants: main image 800px + thumbnail 350px + medium 600px");
  console.log("Firestore image/thumbnail/medium URLs will all be updated to optimized WebP.");
  console.log(`Parallel product workers: ${CONCURRENCY} (Sharp internal concurrency: 2).`);
  console.log("Use --concurrency=6 for lower-memory machines or --concurrency=10 for faster machines.");
  console.log("Original source URLs are preserved in originalImage; source files and gallery images are not deleted.");

  const records = await discoverCatalog();
  console.log(`Found ${records.length} catalog products with Firebase original image URLs.`);

  if (!APPLY) {
    const report = {
      generatedAt: new Date().toISOString(),
      mode: "DRY_RUN",
      bucket: bucket.name,
      productsFound: records.length,
      maxBytes: {
        image: IMAGE_KB * 1024,
        thumbnail: THUMBNAIL_KB * 1024,
        medium: MEDIUM_KB * 1024,
      },
      variants: ["image.webp (up to 800px)", "thumbnail.webp (up to 350px)", "medium.webp (up to 600px)"],
      note: "No files or Firestore documents were changed. Run with --apply to optimize.",
      products: records.map(({ path: docPath, productCode, productName }) => ({
        path: docPath,
        productCode,
        productName,
      })),
    };

    const reportPath = path.join(REPORT_DIR, `dry-run-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Dry-run report: ${reportPath}`);
    console.log("No changes made. Review the report, then run with --apply.");
    return;
  }

  const results = await mapLimit(records, CONCURRENCY, optimizeOne);
  const updated = results.filter((r) => r?.status === "updated").length;
  const errors = results.filter((r) => r?.status === "error").length;
  const skipped = results.filter((r) => r?.status === "skipped").length;

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "APPLY",
    bucket: bucket.name,
    maxBytes: {
      image: IMAGE_KB * 1024,
      thumbnail: THUMBNAIL_KB * 1024,
      medium: MEDIUM_KB * 1024,
    },
    productsFound: records.length,
    updated,
    errors,
    skipped,
    results,
  };

  const reportPath = path.join(REPORT_DIR, `apply-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log("\nOptimization complete.");
  console.log(`Updated: ${updated}`);
  console.log(`Errors: ${errors}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Report: ${reportPath}`);

  const oversized = results.filter((r) =>
    r?.status === "updated" &&
    (r.image.bytes > IMAGE_KB * 1024 ||
     r.thumbnail.bytes > THUMBNAIL_KB * 1024 ||
     r.medium.bytes > MEDIUM_KB * 1024)
  );

  if (oversized.length) {
    console.error(`WARNING: ${oversized.length} product(s) exceeded the configured size limit.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Image optimization failed:", error?.stack || error);
  process.exitCode = 1;
});
