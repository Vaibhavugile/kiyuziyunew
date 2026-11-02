'use strict';

const { initializeApp, applicationDefault, getApps } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');

const APPLY = process.argv.includes('--apply');
const BUCKET_NAME = process.env.FIREBASE_STORAGE_BUCKET || 'jewellerywholesale-2e57c.firebasestorage.app';
const PREFIX = 'invoices/';
const DELETE_CONCURRENCY = 10;

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    storageBucket: BUCKET_NAME
  });
}

const bucket = getStorage().bucket(BUCKET_NAME);

async function mapLimit(items, limit, worker) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function main() {
  console.log('\nFirebase Storage invoices folder cleanup');
  console.log(`Bucket: ${BUCKET_NAME}`);
  console.log(`Target prefix: ${PREFIX}`);
  console.log(`Mode: ${APPLY ? 'DELETE (apply enabled)' : 'DRY RUN (no files will be deleted)'}`);
  console.log('\nListing files...');

  // Exact prefix only. This does not touch files outside invoices/.
  const [files] = await bucket.getFiles({ prefix: PREFIX, autoPaginate: true });
  const targets = files.filter(file => file.name.startsWith(PREFIX));
  const totalBytes = targets.reduce((sum, file) => sum + Number(file.metadata && file.metadata.size || 0), 0);

  console.log(`Files found: ${targets.length}`);
  console.log(`Total size: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`First ${Math.min(20, targets.length)} file paths:`);
  for (const file of targets.slice(0, 20)) console.log(`  ${file.name}`);

  if (!APPLY) {
    console.log('\nDRY RUN ONLY. Review the bucket, prefix, file count and sample paths.');
    console.log('If correct, run: node delete-invoices-folder.js --apply');
    return;
  }

  if (!targets.length) {
    console.log('\nNo files found under invoices/. Nothing to delete.');
    return;
  }

  console.log(`\nDeleting ${targets.length} files with concurrency ${DELETE_CONCURRENCY}...`);
  let deleted = 0;
  await mapLimit(targets, DELETE_CONCURRENCY, async file => {
    await file.delete({ ignoreNotFound: true });
    deleted++;
    if (deleted % 100 === 0 || deleted === targets.length) {
      console.log(`  Deleted ${deleted.toLocaleString()} / ${targets.length.toLocaleString()}`);
    }
  });

  console.log('\n========== STORAGE CLEANUP COMPLETE ==========');
  console.log(`Successfully deleted: ${deleted}`);
  console.log(`Deleted prefix: ${PREFIX}`);
  console.log('Firestore documents were not modified.');
}

main().catch(error => {
  console.error('\nStorage cleanup failed:', error);
  process.exitCode = 1;
});
