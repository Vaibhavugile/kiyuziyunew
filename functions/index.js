const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const sharp = require("sharp");
const os = require("os");
const path = require("path");
const fs = require("fs");

admin.initializeApp();

/**
 * Auto optimize NEW uploads
 */
exports.resizeImage = onObjectFinalized(async (event) => {

  const object = event.data;

  const filePath = object.name;
  const contentType = object.contentType;

  if (!contentType || !contentType.startsWith("image/")) {
    return;
  }

  if (filePath.includes("optimized")) {
    return;
  }

  const bucket = admin.storage().bucket(object.bucket);

  const fileName = path.basename(filePath);
  const tempFilePath = path.join(os.tmpdir(), fileName);

  await bucket.file(filePath).download({
    destination: tempFilePath,
  });

  const optimizedBuffer = await sharp(tempFilePath)
    .resize(800)
    .webp({ quality: 70 })
    .toBuffer();

  const optimizedPath = `optimized/${fileName}.webp`;

  await bucket.file(optimizedPath).save(optimizedBuffer, {
    metadata: {
      contentType: "image/webp",
      cacheControl: "public,max-age=31536000",
    },
  });

  fs.unlinkSync(tempFilePath);

  console.log("Optimized new upload:", filePath);
});


/**
 * Process existing images (1000+ images)
 */

exports.processExistingImages = onRequest(
  {
    memory: "1GiB",
    timeoutSeconds: 540
  },
  async (req, res) => {

    try {

      const bucket = admin.storage().bucket();

      const [files] = await bucket.getFiles({
        prefix: "images/",
      });

      let processed = 0;
      let skipped = 0;

      for (const file of files) {

        const filePath = file.name;

        if (!filePath.match(/\.(jpg|jpeg|png)$/i)) {
          skipped++;
          continue;
        }

        if (filePath.includes("optimized")) {
          skipped++;
          continue;
        }

        console.log("Processing:", filePath);

        const fileName = path.basename(filePath);
        const tempFilePath = path.join(os.tmpdir(), fileName);

        await file.download({ destination: tempFilePath });

        const optimizedBuffer = await sharp(tempFilePath)
          .resize(800)
          .webp({ quality: 70 })
          .toBuffer();

        const optimizedPath = `optimized/${fileName}.webp`;

        await bucket.file(optimizedPath).save(optimizedBuffer, {
          metadata: {
            contentType: "image/webp",
            cacheControl: "public,max-age=31536000",
          },
        });

        fs.unlinkSync(tempFilePath);

        processed++;
      }

      res.send(`✅ Done. Processed ${processed} images | Skipped ${skipped}`);

    } catch (error) {

      console.error(error);
      res.status(500).send(error.message);

    }

});
exports.deleteOptimizedFolder = onRequest(
{
memory: "512MiB",
timeoutSeconds: 540
},
async (req, res) => {

try {

const bucket = admin.storage().bucket();

let query = {
prefix: "optimized/",
maxResults: 500
};

let deleted = 0;

do {

const [files, , response] = await bucket.getFiles(query);

await Promise.all(
files.map(async (file) => {
await file.delete();
deleted++;
})
);

query.pageToken = response.nextPageToken;

} while (query.pageToken);

res.send(`Deleted ${deleted} files from optimized/ folder`);

} catch (error) {

console.error(error);
res.status(500).send(error.message);

}

});