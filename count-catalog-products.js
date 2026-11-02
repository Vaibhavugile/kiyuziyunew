/**
 * Count-only Firestore catalog check.
 * Reads document counts from:
 * collections/{collectionId}/subcollections/{subcollectionId}/products
 * collections/{collectionId}/subcollections/{subcollectionId}/appProducts
 *
 * No documents or Storage objects are changed.
 *
 * Run:
 *   node count-catalog-products.js
 */
"use strict";

const { applicationDefault, getApps, initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error("Missing GOOGLE_APPLICATION_CREDENTIALS.");
  process.exit(1);
}
if (!bucketName) {
  console.error("Missing FIREBASE_STORAGE_BUCKET.");
  process.exit(1);
}

const app = getApps().length
  ? getApps()[0]
  : initializeApp({ credential: applicationDefault(), storageBucket: bucketName });
const db = getFirestore(app);

async function main() {
  let productsTotal = 0;
  let appProductsTotal = 0;
  let subcollectionsChecked = 0;
  const rows = [];

  console.log("Counting catalog products (read-only)...\n");
  const collections = await db.collection("collections").get();

  for (const collectionDoc of collections.docs) {
    const subcollections = await collectionDoc.ref.collection("subcollections").get();

    for (const subcollectionDoc of subcollections.docs) {
      subcollectionsChecked++;

      const [productsSnap, appProductsSnap] = await Promise.all([
        subcollectionDoc.ref.collection("products").get(),
        subcollectionDoc.ref.collection("appProducts").get(),
      ]);

      productsTotal += productsSnap.size;
      appProductsTotal += appProductsSnap.size;

      rows.push({
        collection: collectionDoc.id,
        subcollection: subcollectionDoc.id,
        products: productsSnap.size,
        appProducts: appProductsSnap.size,
        total: productsSnap.size + appProductsSnap.size,
      });

      console.log(
        `${collectionDoc.id} / ${subcollectionDoc.id}  |  products: ${productsSnap.size}  |  appProducts: ${appProductsSnap.size}  |  total: ${productsSnap.size + appProductsSnap.size}`
      );
    }
  }

  console.log("\n========== CATALOG COUNT ==========");
  console.log(`Top-level collections: ${collections.size}`);
  console.log(`Subcollections checked: ${subcollectionsChecked}`);
  console.log(`products total: ${productsTotal}`);
  console.log(`appProducts total: ${appProductsTotal}`);
  console.log(`GRAND TOTAL: ${productsTotal + appProductsTotal}`);
  console.log("===================================");
}

main().catch((error) => {
  console.error("Count failed:", error?.stack || error);
  process.exitCode = 1;
});
