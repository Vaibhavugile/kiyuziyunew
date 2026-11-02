#!/usr/bin/env node
'use strict';

/**
 * Removes stale copied product records from:
 *   dropshipperProducts/{userId}/products/{productId}
 *   storeProducts/{userId}/products/{productId}
 *
 * A copied record is stale when its collection/subcollection reference is
 * missing, or when the referenced catalog subcollection has zero documents
 * across BOTH `products` and `appProducts`.
 *
 * Safe by default: this script only reports what it would delete.
 * Pass --apply to perform deletions.
 */

const { getApps, initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldPath } = require('firebase-admin/firestore');

const ROOT_COLLECTIONS = ['dropshipperProducts', 'storeProducts'];
const CATALOG_COLLECTION = 'collections';
const SUBCOLLECTIONS_COLLECTION = 'subcollections';
const PRODUCT_COLLECTIONS = ['products', 'appProducts'];
const PAGE_SIZE = 500;
const BATCH_LIMIT = 450;

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const item = process.argv.find((arg) => arg.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

const PROJECT_ID = getArg('project', process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID);

if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    ...(PROJECT_ID ? { projectId: PROJECT_ID } : {}),
  });
}

const db = getFirestore();

async function getAllDocsPaged(collectionRef) {
  const docs = [];
  let lastDoc = null;

  while (true) {
    let query = collectionRef.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    docs.push(...snapshot.docs);
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < PAGE_SIZE) break;
  }

  return docs;
}

async function countCollection(collectionRef) {
  // Aggregation count is much lighter than downloading every product document.
  if (typeof collectionRef.count === 'function') {
    const result = await collectionRef.count().get();
    return result.data().count || 0;
  }

  // Compatibility fallback for older firebase-admin versions.
  let total = 0;
  let lastDoc = null;
  while (true) {
    let query = collectionRef.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (lastDoc) query = query.startAfter(lastDoc);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    total += snapshot.size;
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < PAGE_SIZE) break;
  }
  return total;
}

const catalogStatusCache = new Map();

async function getCatalogSubcollectionStatus(collectionId, subcollectionId) {
  const cacheKey = `${collectionId}/${subcollectionId}`;
  if (catalogStatusCache.has(cacheKey)) return catalogStatusCache.get(cacheKey);

  const promise = (async () => {
    const collectionRef = db.collection(CATALOG_COLLECTION).doc(collectionId);
    const collectionSnap = await collectionRef.get();
    if (!collectionSnap.exists) {
      return { exists: false, reason: 'collection_not_found', products: 0, appProducts: 0, total: 0 };
    }

    const subcollectionRef = collectionRef
      .collection(SUBCOLLECTIONS_COLLECTION)
      .doc(subcollectionId);
    const subcollectionSnap = await subcollectionRef.get();
    if (!subcollectionSnap.exists) {
      return { exists: false, reason: 'subcollection_not_found', products: 0, appProducts: 0, total: 0 };
    }

    const [products, appProducts] = await Promise.all([
      countCollection(subcollectionRef.collection('products')),
      countCollection(subcollectionRef.collection('appProducts')),
    ]);

    return {
      exists: true,
      reason: products + appProducts === 0 ? 'empty_subcollection' : 'has_products',
      products,
      appProducts,
      total: products + appProducts,
    };
  })();

  catalogStatusCache.set(cacheKey, promise);
  return promise;
}

async function main() {
  console.log('\nFirebase copied-product cleanup');
  console.log(`Mode: ${APPLY ? 'APPLY (deletions enabled)' : 'DRY RUN (no data will be deleted)'}`);
  // Do not access Firestore's projectId getter before the first request;
  // newer @google-cloud/firestore versions throw until the client is ready.
  const actualProjectId = getApps()[0]?.options?.projectId || PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '(from application default credentials)';
  console.log(`Project: ${actualProjectId}`);
  console.log(`Targets: ${ROOT_COLLECTIONS.join(', ')}`);
  console.log('Catalog check: collections/{collectionId}/subcollections/{subcollectionId}/products + appProducts\n');

  const summary = {
    scannedUsers: 0,
    scannedCopiedProducts: 0,
    eligibleForDeletion: 0,
    deleted: 0,
    byRoot: {},
    byReason: {
      collection_not_found: 0,
      subcollection_not_found: 0,
      empty_subcollection: 0,
      missing_reference_ids: 0,
    },
  };

  let batch = db.batch();
  let pendingWrites = 0;

  async function flushBatch() {
    if (!APPLY || pendingWrites === 0) return;
    await batch.commit();
    summary.deleted += pendingWrites;
    console.log(`  Deleted ${summary.deleted} copied product records so far...`);
    batch = db.batch();
    pendingWrites = 0;
  }

  // Use a collection-group query instead of enumerating root documents.
  // This also finds copied product docs when root collection enumeration is
  // affected by how the project/database is configured.
  for (const rootName of ROOT_COLLECTIONS) {
    const rootSummary = { users: 0, copiedProducts: 0, staleProducts: 0 };
    summary.byRoot[rootName] = rootSummary;
    console.log(`Scanning ${rootName} with collectionGroup('products')...`);

    const seenUsers = new Set();
    let lastDoc = null;
    while (true) {
      let query = db.collectionGroup('products')
        .orderBy(FieldPath.documentId())
        .limit(PAGE_SIZE);
      if (lastDoc) query = query.startAfter(lastDoc);
      const page = await query.get();
      if (page.empty) break;
      lastDoc = page.docs[page.docs.length - 1];

      for (const copiedProductDoc of page.docs) {
        const pathParts = copiedProductDoc.ref.path.split('/');
        // Exact shape: {root}/{userId}/products/{productId}
        if (pathParts.length !== 4 || pathParts[0] !== rootName || pathParts[2] !== 'products') continue;

        const userId = pathParts[1];
        if (!seenUsers.has(userId)) {
          seenUsers.add(userId);
          summary.scannedUsers++;
          rootSummary.users++;
        }

        summary.scannedCopiedProducts++;
        rootSummary.copiedProducts++;
        const data = copiedProductDoc.data() || {};
        const collectionId = typeof data.collectionId === 'string' ? data.collectionId.trim() : '';
        const subcollectionId = typeof data.subcollectionId === 'string' ? data.subcollectionId.trim() : '';

        let reason = null;
        let status = null;
        if (!collectionId || !subcollectionId) {
          reason = 'missing_reference_ids';
        } else {
          status = await getCatalogSubcollectionStatus(collectionId, subcollectionId);
          if (!status.exists || status.total === 0) reason = status.reason;
        }

        if (!reason) continue;

        summary.eligibleForDeletion++;
        rootSummary.staleProducts++;
        summary.byReason[reason]++;

        if (VERBOSE) {
          console.log(
            `  [${reason}] ${copiedProductDoc.ref.path}` +
            ` (collectionId=${collectionId || 'MISSING'}, subcollectionId=${subcollectionId || 'MISSING'})` +
            (status ? ` (products=${status.products}, appProducts=${status.appProducts})` : '')
          );
        }

        if (APPLY) {
          batch.delete(copiedProductDoc.ref);
          pendingWrites++;
          if (pendingWrites >= BATCH_LIMIT) await flushBatch();
        }
      }

      if (page.size < PAGE_SIZE) break;
    }

    console.log(
      `  ${rootName}: ${rootSummary.users} users, ${rootSummary.copiedProducts} copied products, ` +
      `${rootSummary.staleProducts} stale records${APPLY ? ' queued/deleted' : ' would be deleted'}.`
    );
  }

  await flushBatch();

  console.log('\n========== CLEANUP SUMMARY ==========');
  console.log(`Users scanned:                 ${summary.scannedUsers}`);
  console.log(`Copied product records scanned: ${summary.scannedCopiedProducts}`);
  console.log(`Eligible for deletion:          ${summary.eligibleForDeletion}`);
  if (APPLY) console.log(`Successfully deleted:            ${summary.deleted}`);
  console.log('\nReasons:');
  for (const [reason, count] of Object.entries(summary.byReason)) {
    console.log(`  ${reason}: ${count}`);
  }

  if (!APPLY && summary.eligibleForDeletion > 0) {
    console.log('\nDry run only. Review the report, then run again with --apply to delete these records.');
  } else if (!APPLY) {
    console.log('\nNo stale copied product records found.');
  } else {
    console.log('\nCleanup completed. Original catalog products and Storage images were not modified.');
  }

  console.log('\nFull summary JSON:');
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\nCleanup failed:', error);
    process.exit(1);
  });
