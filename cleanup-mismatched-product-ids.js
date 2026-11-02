'use strict';

const { initializeApp, applicationDefault, getApps } = require('firebase-admin/app');
const { getFirestore, FieldPath } = require('firebase-admin/firestore');

const ROOTS = ['dropshipperProducts', 'storeProducts'];
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const SAMPLE_LIMIT = 30;
const DELETE_BATCH_SIZE = 400;
const CHECK_CONCURRENCY = 20;

if (!getApps().length) {
  initializeApp({ credential: applicationDefault() });
}
const db = getFirestore();

function isCopiedProductDoc(doc) {
  const p = doc.ref.path.split('/');
  return p.length === 4 && ROOTS.includes(p[0]) && p[2] === 'products';
}

async function mapLimit(items, limit, worker) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  });
  await Promise.all(workers);
}

async function main() {
  console.log('\nFirebase copied-product ID consistency cleanup');
  console.log(`Mode: ${APPLY ? 'APPLY (deletions enabled)' : 'DRY RUN (no data will be deleted)'}`);
  console.log('Source of truth: collections/{collectionId}/subcollections/{subcollectionId}/products|appProducts/{productId}');
  console.log('Rule: retain copied record only if its productId exists as a document ID in either source path.');

  const candidates = [];
  for (const root of ROOTS) {
    console.log(`\nScanning ${root}...`);
    const snap = await db.collectionGroup('products').get();
    const docs = snap.docs.filter(d => isCopiedProductDoc(d) && d.ref.path.startsWith(`${root}/`));
    console.log(`  Found ${docs.length} copied records.`);
    candidates.push(...docs);
  }

  const stale = [];
  const reasonCounts = { missing_product_id: 0, product_id_not_found_in_referenced_subcollection: 0 };
  const rootCounts = Object.fromEntries(ROOTS.map(root => [root, { scanned: 0, stale: 0, retained: 0 }]));
  const sample = [];

  await mapLimit(candidates, CHECK_CONCURRENCY, async doc => {
    const root = doc.ref.path.split('/')[0];
    rootCounts[root].scanned++;
    const data = doc.data() || {};
    const productId = typeof data.productId === 'string' ? data.productId.trim() : '';
    const collectionId = typeof data.collectionId === 'string' ? data.collectionId.trim() : '';
    const subcollectionId = typeof data.subcollectionId === 'string' ? data.subcollectionId.trim() : '';

    let exists = false;
    if (productId && collectionId && subcollectionId) {
      const base = db.collection('collections').doc(collectionId)
        .collection('subcollections').doc(subcollectionId);
      const [webProduct, appProduct] = await Promise.all([
        base.collection('products').doc(productId).get(),
        base.collection('appProducts').doc(productId).get(),
      ]);
      exists = webProduct.exists || appProduct.exists;
    }

    if (exists) {
      rootCounts[root].retained++;
      return;
    }

    rootCounts[root].stale++;
    stale.push(doc.ref);
    if (!productId) reasonCounts.missing_product_id++;
    else reasonCounts.product_id_not_found_in_referenced_subcollection++;
    if (sample.length < SAMPLE_LIMIT) {
      sample.push({ copiedPath: doc.ref.path, productId: productId || null, collectionId: collectionId || null, subcollectionId: subcollectionId || null });
    }
  });

  console.log('\n========== DRY-RUN / SCAN SUMMARY ==========');
  console.log(`Copied records scanned: ${candidates.length}`);
  console.log(`Product IDs with no matching source product: ${stale.length}`);
  for (const root of ROOTS) {
    const c = rootCounts[root];
    console.log(`${root}: scanned=${c.scanned}, retained=${c.retained}, stale=${c.stale}`);
  }
  console.log('Reasons:', JSON.stringify(reasonCounts, null, 2));
  if (sample.length) {
    console.log(`\nFirst ${sample.length} stale record(s):`);
    for (const item of sample) console.log(JSON.stringify(item));
  }

  if (!APPLY) {
    console.log('\nDRY RUN ONLY. Review the results, then run with --apply to delete these copied records.');
    return;
  }

  console.log(`\nDeleting ${stale.length} stale copied records...`);
  let deleted = 0;
  for (let i = 0; i < stale.length; i += DELETE_BATCH_SIZE) {
    const batch = db.batch();
    const chunk = stale.slice(i, i + DELETE_BATCH_SIZE);
    for (const ref of chunk) batch.delete(ref);
    await batch.commit();
    deleted += chunk.length;
    console.log(`  Deleted ${deleted} / ${stale.length}`);
  }
  console.log('\n========== CLEANUP COMPLETE ==========');
  console.log(`Successfully deleted: ${deleted}`);
  console.log('Original catalog products and Storage images were not modified.');
}

main().catch(error => {
  console.error('\nCleanup failed:', error);
  process.exitCode = 1;
});
