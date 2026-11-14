import React, { useEffect, useRef, useState } from "react";
import {
  db, collection, getDocs, getDoc, updateDoc, deleteDoc, doc, storage, ref,
  uploadBytes, getDownloadURL, deleteObject, serverTimestamp,
  query, orderBy, limit, startAfter, writeBatch, runTransaction,
} from "../firebase";
import "./AdminPreorderPage.css";

const PREORDER_COLLECTION = "preorderProducts";
const PRODUCT_COUNTER_REF = doc(db, "preorderCounters", "productName");

async function reserveProductNames(count) {
  if (!count) return [];

  // Initialize from existing chainNNN names only when the counter document is absent.
  const counterSnapshot = await getDoc(PRODUCT_COUNTER_REF);
  let initialNextNumber = 1;

  if (!counterSnapshot.exists()) {
    const existing = await getDocs(collection(db, PREORDER_COLLECTION));
    const highest = existing.docs.reduce((max, item) => {
      const match = String(item.data().productName || "").match(/^chain(\d+)$/i);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    initialNextNumber = highest + 1;
  }

  return runTransaction(db, async (transaction) => {
    const latest = await transaction.get(PRODUCT_COUNTER_REF);
    const start = latest.exists()
      ? Number(latest.data().nextNumber || 1)
      : initialNextNumber;
    const names = Array.from({ length: count }, (_, index) =>
      `chain${String(start + index).padStart(3, "0")}`
    );
    transaction.set(PRODUCT_COUNTER_REF, {
      prefix: "chain",
      nextNumber: start + count,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return names;
  });
}

const slugify = (value = "preorder") =>
  String(value).toLowerCase().trim().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "preorder";

const makeDraft = (file, generatedName) => ({
  id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
  file,
  previewUrl: URL.createObjectURL(file),
  productName: generatedName,
  quantityType: "boxes",
  boxQuantity: "",
  variants: [],
  variantName: "",
  variantBoxQuantity: "",
  additionalFiles: [],
  description: "",
});

async function compressToWebp(file, options) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch {
    bitmap = await new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(objectUrl); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error(`Unable to read ${file.name}`)); };
      img.src = objectUrl;
    });
  }
  const sw = bitmap.width || bitmap.naturalWidth;
  const sh = bitmap.height || bitmap.naturalHeight;
  if (!sw || !sh) { bitmap.close?.(); throw new Error(`Invalid image: ${file.name}`); }
  const scale = Math.min(options.maxWidth / sw, options.maxHeight / sh, 1);
  let width = Math.max(1, Math.round(sw * scale));
  let height = Math.max(1, Math.round(sh * scale));
  let quality = options.quality;
  let blob = null;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) { bitmap.close?.(); throw new Error("Could not prepare image for optimization."); }
  for (let attempt = 0; attempt < 16; attempt += 1) {
    canvas.width = width; canvas.height = height;
    context.drawImage(bitmap, 0, 0, width, height);
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob) { bitmap.close?.(); throw new Error(`WebP conversion failed: ${file.name}`); }
    if (blob.size <= options.maxBytes) break;
    if (quality > 0.4) quality = Math.max(0.4, quality - 0.07);
    else { width = Math.max(160, Math.round(width * 0.82)); height = Math.max(160, Math.round(height * 0.82)); quality = Math.max(0.28, quality - 0.02); }
  }
  bitmap.close?.();
  if (!blob || blob.size > options.maxBytes) throw new Error(`Could not compress ${file.name} below ${Math.round(options.maxBytes / 1024)} KB.`);
  return blob;
}

async function uploadOptimizedImage(file, productKey, role) {
  const variants = [
    { key: "image", filename: "image.webp", maxWidth: 1000, maxHeight: 1000, maxBytes: 80 * 1024, quality: 0.78 },
    { key: "thumbnail", filename: "thumbnail.webp", maxWidth: 350, maxHeight: 350, maxBytes: 50 * 1024, quality: 0.62 },
    { key: "medium", filename: "medium.webp", maxWidth: 700, maxHeight: 700, maxBytes: 80 * 1024, quality: 0.72 },
  ];
  const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const uploaded = await Promise.all(variants.map(async (variant) => {
    const blob = await compressToWebp(file, variant);
    const imageRef = ref(storage, `preorder-products/optimized/${productKey}/${role}/${uploadId}/${variant.filename}`);
    const snapshot = await uploadBytes(imageRef, blob, {
      contentType: "image/webp",
      cacheControl: "public,max-age=31536000,immutable",
      customMetadata: { originalName: file.name || "preorder-image", variant: variant.key },
    });
    return { key: variant.key, url: await getDownloadURL(snapshot.ref), bytes: blob.size };
  }));
  return uploaded.reduce((result, item) => {
    result[item.key] = item.url;
    result[`${item.key}Bytes`] = item.bytes;
    return result;
  }, {});
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

const SAVED_PAGE_SIZE = 20;
const SAVE_CONCURRENCY = 3;

const removeStorageUrl = async (url) => {
  if (!url) return;
  try { await deleteObject(ref(storage, url)); }
  catch (error) { console.warn("Could not delete pre-order image:", url, error); }
};

export default function AdminPreorderPage() {
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState("");
  const [drafts, setDrafts] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [savedProducts, setSavedProducts] = useState([]);
  const [savedCursor, setSavedCursor] = useState(null);
  const [hasMoreSaved, setHasMoreSaved] = useState(true);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [loadingMoreSaved, setLoadingMoreSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allocatingNames, setAllocatingNames] = useState(false);
  const [bulkBoxQuantity, setBulkBoxQuantity] = useState("");
  const [saveProgress, setSaveProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editMainFile, setEditMainFile] = useState(null);
  const [editAdditionalFiles, setEditAdditionalFiles] = useState([]);
  const [editSaving, setEditSaving] = useState(false);
  const fileInputRef = useRef(null);
  const additionalInputRef = useRef(null);
  const activeDraft = drafts[activeIndex] || null;
  const selectedCategory = categories.find((item) => item.id === categoryId);

  const loadCategories = async () => {
    setLoadingCategories(true);
    try {
      const snapshot = await getDocs(collection(db, "collections"));
      const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      rows.sort((a, b) => Number(a.showNumber || 0) - Number(b.showNumber || 0));
      setCategories(rows);
    } catch (err) {
      console.error("Failed to load categories:", err);
      setError("Could not load categories. Please refresh and try again.");
    } finally { setLoadingCategories(false); }
  };

  const loadSavedProducts = async (reset = true) => {
    if (reset) setLoadingSaved(true);
    else setLoadingMoreSaved(true);
    try {
      const productsRef = collection(db, PREORDER_COLLECTION);
      const constraints = [orderBy("createdAt", "desc"), limit(SAVED_PAGE_SIZE)];
      if (!reset && savedCursor) constraints.splice(1, 0, startAfter(savedCursor));
      const snapshot = await getDocs(query(productsRef, ...constraints));
      const rows = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setSavedProducts((current) => reset ? rows : [...current, ...rows]);
      setSavedCursor(snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : (reset ? null : savedCursor));
      setHasMoreSaved(snapshot.docs.length === SAVED_PAGE_SIZE);
    } catch (err) {
      console.error("Failed to load pre-order products:", err);
      setError("Could not load saved pre-order products.");
    } finally {
      setLoadingSaved(false);
      setLoadingMoreSaved(false);
    }
  };

  useEffect(() => {
    loadCategories();
    loadSavedProducts();
    return () => {
      drafts.forEach((draft) => {
        if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
        (draft.additionalFiles || []).forEach((file) => file.previewUrl && URL.revokeObjectURL(file.previewUrl));
      });
    };
  }, []);

  const updateDraft = (id, patch) => setDrafts((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));

  // Apply one box quantity to every product currently in the upload queue.
  // This intentionally switches all queued products to the single-box quantity mode.
  const applyBulkBoxQuantity = () => {
    const quantity = Number(bulkBoxQuantity);
    if (bulkBoxQuantity === "" || !Number.isInteger(quantity) || quantity < 0) {
      setError("Enter a valid whole-number box quantity before applying it.");
      return;
    }

    setDrafts((current) => current.map((draft) => ({
      ...draft,
      quantityType: "boxes",
      boxQuantity: String(quantity),
      variants: [],
      variantName: "",
      variantBoxQuantity: "",
    })));
    setError("");
    setSuccess(`Applied ${quantity} boxes to all ${drafts.length} products in this upload batch.`);
  };

  const handlePrimaryImages = async (event) => {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/"));
    event.target.value = "";
    if (!files.length) return;

    setError("");
    setSuccess("");
    setAllocatingNames(true);
    try {
      const generatedNames = await reserveProductNames(files.length);
      const newDrafts = files.map((file, index) => makeDraft(file, generatedNames[index]));
      setDrafts((current) => [...current, ...newDrafts]);
    } catch (err) {
      console.error("Could not reserve unique pre-order product names:", err);
      setError("Could not generate unique product names. Check Firestore permissions and try again.");
    } finally {
      setAllocatingNames(false);
    }
  };

  const handleAdditionalImages = (event) => {
    if (!activeDraft) return;
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/"));
    const additions = files.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
    updateDraft(activeDraft.id, { additionalFiles: [...activeDraft.additionalFiles, ...additions] });
    event.target.value = "";
  };

  const addVariant = () => {
    if (!activeDraft) return;
    const name = activeDraft.variantName.trim();
    const qty = Number(activeDraft.variantBoxQuantity);
    if (!name || activeDraft.variantBoxQuantity === "" || !Number.isFinite(qty) || qty < 0) {
      setError("Enter a variant name and a valid box quantity."); return;
    }
    updateDraft(activeDraft.id, {
      variants: [...activeDraft.variants, { name, boxQuantity: qty }],
      variantName: "", variantBoxQuantity: "",
    });
    setError("");
  };

  const updateVariant = (draftId, variantIndex, patch) => setDrafts((current) => current.map((draft) => {
    if (draft.id !== draftId) return draft;
    return { ...draft, variants: draft.variants.map((variant, index) => index === variantIndex ? { ...variant, ...patch } : variant) };
  }));

  const removeDraft = (draftId) => {
    const removed = drafts.find((item) => item.id === draftId);
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    (removed?.additionalFiles || []).forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
    setDrafts((current) => current.filter((item) => item.id !== draftId));
    setActiveIndex((current) => Math.max(0, Math.min(current, drafts.length - 2)));
  };

  const removeAdditional = (draftId, index) => setDrafts((current) => current.map((draft) => {
    if (draft.id !== draftId) return draft;
    const target = draft.additionalFiles[index];
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    return { ...draft, additionalFiles: draft.additionalFiles.filter((_, i) => i !== index) };
  }));

  const validateDraft = (draft) => {
    if (!draft.productName.trim()) return `Add a product name for image ${draft.file.name}.`;
    if (draft.quantityType === "boxes" && (draft.boxQuantity === "" || !Number.isFinite(Number(draft.boxQuantity)) || Number(draft.boxQuantity) < 0)) return `Enter the box quantity for ${draft.productName}.`;
    if (draft.quantityType === "variants" && !draft.variants.length) return `Add at least one variant for ${draft.productName}.`;
    return "";
  };

  const saveAll = async () => {
    setError("");
    setSuccess("");
    if (!categoryId) { setError("Select a category first."); return; }
    if (!drafts.length) { setError("Upload all the main product images first."); return; }
    for (const draft of drafts) {
      const validation = validateDraft(draft);
      if (validation) {
        setError(validation);
        setActiveIndex(drafts.findIndex((item) => item.id === draft.id));
        return;
      }
    }

    setSaving(true);
    setSaveProgress({ completed: 0, total: drafts.length });
    try {
      // Process three products at a time to keep the browser responsive.
      // Each product's main and additional image uploads run concurrently.
      const preparedProducts = await mapWithConcurrency(drafts, SAVE_CONCURRENCY, async (draft, index) => {
        const productKey = `${slugify(draft.productName)}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`;
        const allFiles = [
          { file: draft.file, role: "main" },
          ...draft.additionalFiles.map((item, imageIndex) => ({ file: item.file, role: `additional-${imageIndex + 1}` })),
        ];
        const uploadedImages = await Promise.all(allFiles.map((item) => uploadOptimizedImage(item.file, productKey, item.role)));
        const main = uploadedImages[0];
        const additional = uploadedImages.slice(1);
        const totalBoxes = draft.quantityType === "boxes"
          ? Number(draft.boxQuantity)
          : draft.variants.reduce((sum, variant) => sum + Number(variant.boxQuantity || 0), 0);

        setSaveProgress((current) => ({ ...current, completed: current.completed + 1 }));
        return {
          productName: draft.productName.trim(),
          categoryId,
          categoryName: selectedCategory?.title || selectedCategory?.name || "",
          mainImage: main.image,
          image: main.image,
          thumbnail: main.thumbnail,
          medium: main.medium,
          imageBytes: { image: main.imageBytes, thumbnail: main.thumbnailBytes, medium: main.mediumBytes },
          additionalImages: additional.map((item) => item.image),
          additionalThumbnails: additional.map((item) => item.thumbnail),
          additionalMediumImages: additional.map((item) => item.medium),
          quantityType: draft.quantityType,
          boxQuantity: draft.quantityType === "boxes" ? Number(draft.boxQuantity) : null,
          variants: draft.quantityType === "variants"
            ? draft.variants.map((variant) => ({ name: variant.name, boxQuantity: Number(variant.boxQuantity) }))
            : [],
          totalBoxes,
          description: draft.description.trim(),
          imageFormat: "webp",
          status: "preorder",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
      });

      // Commit Firestore documents in batches of 20.
      for (let offset = 0; offset < preparedProducts.length; offset += SAVED_PAGE_SIZE) {
        const batch = writeBatch(db);
        preparedProducts.slice(offset, offset + SAVED_PAGE_SIZE).forEach((productData) => {
          batch.set(doc(collection(db, PREORDER_COLLECTION)), productData);
        });
        await batch.commit();
      }

      drafts.forEach((draft) => {
        if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
        draft.additionalFiles.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
      });
      setDrafts([]);
      setActiveIndex(0);
      setSuccess(`Successfully saved ${preparedProducts.length} pre-order product${preparedProducts.length === 1 ? "" : "s"} with optimized WebP images.`);
      await loadSavedProducts(true);
    } catch (err) {
      console.error("Pre-order save failed:", err);
      setError(err.message || "Some products could not be saved. Check Firebase Storage and Firestore permissions.");
      await loadSavedProducts(true);
    } finally {
      setSaving(false);
      setSaveProgress({ completed: 0, total: 0 });
    }
  };

  const openEditProduct = (product) => {
    setEditingProduct(product);
    setEditForm({
      productName: product.productName || "",
      categoryId: product.categoryId || "",
      quantityType: product.quantityType === "variants" ? "variants" : "boxes",
      boxQuantity: product.boxQuantity ?? "",
      variants: (product.variants || []).map((variant) => ({
        name: variant.name || "",
        boxQuantity: variant.boxQuantity ?? 0,
      })),
      description: product.description || "",
    });
    setEditMainFile(null);
    setEditAdditionalFiles([]);
    setError("");
    setSuccess("");
  };

  const closeEditProduct = () => {
    setEditingProduct(null);
    setEditForm(null);
    setEditMainFile(null);
    setEditAdditionalFiles([]);
  };

  const updateEditVariant = (index, patch) => {
    setEditForm((current) => ({
      ...current,
      variants: current.variants.map((variant, i) => i === index ? { ...variant, ...patch } : variant),
    }));
  };

  const saveEditedProduct = async () => {
    if (!editingProduct || !editForm) return;
    if (!editForm.productName.trim()) { setError("Product name is required."); return; }
    if (!editForm.categoryId) { setError("Select a category."); return; }
    if (editForm.quantityType === "boxes" &&
      (editForm.boxQuantity === "" || !Number.isFinite(Number(editForm.boxQuantity)) || Number(editForm.boxQuantity) < 0)) {
      setError("Enter a valid box quantity."); return;
    }
    if (editForm.quantityType === "variants" &&
      (!editForm.variants.length || editForm.variants.some((v) => !v.name.trim() || !Number.isFinite(Number(v.boxQuantity)) || Number(v.boxQuantity) < 0))) {
      setError("Add valid variant names and box quantities."); return;
    }

    setEditSaving(true);
    setError("");
    try {
      const category = categories.find((item) => item.id === editForm.categoryId);
      const productKey = `${slugify(editForm.productName)}-${editingProduct.id}`;
      const patch = {
        productName: editForm.productName.trim(),
        categoryId: editForm.categoryId,
        categoryName: category?.title || category?.name || "",
        quantityType: editForm.quantityType,
        boxQuantity: editForm.quantityType === "boxes" ? Number(editForm.boxQuantity) : null,
        variants: editForm.quantityType === "variants"
          ? editForm.variants.map((v) => ({ name: v.name.trim(), boxQuantity: Number(v.boxQuantity) }))
          : [],
        totalBoxes: editForm.quantityType === "boxes"
          ? Number(editForm.boxQuantity)
          : editForm.variants.reduce((sum, v) => sum + Number(v.boxQuantity || 0), 0),
        description: editForm.description.trim(),
        updatedAt: serverTimestamp(),
      };

      const oldUrlsToDelete = [];
      if (editMainFile) {
        const uploaded = await uploadOptimizedImage(editMainFile, productKey, "main-edited");
        oldUrlsToDelete.push(editingProduct.image, editingProduct.mainImage, editingProduct.thumbnail, editingProduct.medium);
        patch.mainImage = uploaded.image;
        patch.image = uploaded.image;
        patch.thumbnail = uploaded.thumbnail;
        patch.medium = uploaded.medium;
        patch.imageBytes = { image: uploaded.imageBytes, thumbnail: uploaded.thumbnailBytes, medium: uploaded.mediumBytes };
      }

      if (editAdditionalFiles.length) {
        const currentImages = editingProduct.additionalImages || [];
        const currentThumbs = editingProduct.additionalThumbnails || [];
        const currentMedium = editingProduct.additionalMediumImages || [];
        const added = [];
        for (let i = 0; i < editAdditionalFiles.length; i += 1) {
          added.push(await uploadOptimizedImage(editAdditionalFiles[i], productKey, `additional-edited-${Date.now()}-${i + 1}`));
        }
        patch.additionalImages = [...currentImages, ...added.map((item) => item.image)];
        patch.additionalThumbnails = [...currentThumbs, ...added.map((item) => item.thumbnail)];
        patch.additionalMediumImages = [...currentMedium, ...added.map((item) => item.medium)];
      }

      await updateDoc(doc(db, PREORDER_COLLECTION, editingProduct.id), patch);
      if (oldUrlsToDelete.length) await Promise.all(oldUrlsToDelete.filter(Boolean).map(removeStorageUrl));
      setSavedProducts((current) => current.map((item) => item.id === editingProduct.id ? { ...item, ...patch } : item));
      setSuccess(`"${editForm.productName.trim()}" updated successfully.`);
      closeEditProduct();
    } catch (err) {
      console.error("Pre-order product update failed:", err);
      setError(err.message || "Could not update this pre-order product.");
    } finally {
      setEditSaving(false);
    }
  };

  const deleteSavedProduct = async (product) => {
    if (!window.confirm(`Delete pre-order product "${product.productName}"?`)) return;
    try {
      await deleteDoc(doc(db, PREORDER_COLLECTION, product.id));
      const urls = [
        product.image, product.thumbnail, product.medium,
        ...(product.additionalImages || []), ...(product.additionalThumbnails || []), ...(product.additionalMediumImages || []),
      ].filter(Boolean);
      await Promise.all(urls.map(removeStorageUrl));
      setSavedProducts((current) => current.filter((item) => item.id !== product.id));
    } catch (err) {
      console.error("Could not delete pre-order product:", err);
      setError("Could not delete this pre-order product.");
    }
  };

  return (
    <div className="admin-preorder-page">
      <header className="preorder-header">
        <div><span className="preorder-eyebrow">CATALOG MANAGEMENT</span><h1>Pre-order products</h1><p>Upload all product photos first, then complete each product one by one.</p></div>
        <div className="preorder-header-stat"><strong>{drafts.length}</strong><span>Products in this upload</span></div>
      </header>

      {error && <div className="preorder-alert error">{error}</div>}
      {success && <div className="preorder-alert success">{success}</div>}

      <section className="preorder-panel">
        <div className="preorder-section-heading"><div><span className="preorder-step">01</span><div><h2>Choose category & upload images</h2><p>Select one category, then select all main product images together.</p></div></div></div>
        <div className="preorder-top-controls">
          <label className="preorder-field preorder-category-field"><span>Product category</span>
            <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} disabled={loadingCategories}>
              <option value="">{loadingCategories ? "Loading categories..." : "Select category"}</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.title || category.name || "Untitled category"}</option>)}
            </select>
          </label>
          <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={handlePrimaryImages} />
          <button className="preorder-primary-button" type="button" disabled={allocatingNames || saving} onClick={() => fileInputRef.current?.click()}><span>＋</span> {allocatingNames ? "Generating product names..." : "Upload all product images"}</button>
        </div>

        {drafts.length > 0 && <>
          <div className="preorder-queue-heading"><div><strong>{drafts.length} images uploaded</strong><span> · Complete each card below one at a time</span></div><div className="preorder-progress"><span style={{ width: `${((activeIndex + 1) / drafts.length) * 100}%` }} /></div></div>

          <div className="preorder-bulk-quantity">
            <div className="preorder-bulk-copy">
              <strong>Bulk box quantity</strong>
              <span>Set the same number of boxes for every product in this uploaded batch.</span>
            </div>
            <div className="preorder-bulk-actions">
              <label className="preorder-bulk-input-wrap">
                <span>Boxes per product</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={bulkBoxQuantity}
                  onChange={(event) => setBulkBoxQuantity(event.target.value)}
                  placeholder="e.g. 50"
                />
              </label>
              <button type="button" className="preorder-secondary-button" onClick={applyBulkBoxQuantity} disabled={saving || !drafts.length}>
                Apply to all {drafts.length} products
              </button>
            </div>
            <small>This changes all queued products to single box quantity mode and replaces any per-product variant quantities.</small>
          </div>

          <div className="preorder-workspace">
            <aside className="preorder-image-queue">
              {drafts.map((draft, index) => <button type="button" key={draft.id} className={index === activeIndex ? "queue-item active" : "queue-item"} onClick={() => setActiveIndex(index)}>
                <img src={draft.previewUrl} alt="" /><span><b>{String(index + 1).padStart(2, "0")}</b>{draft.productName || draft.file.name}</span>
                <i>{draft.quantityType === "variants" ? `${draft.variants.length} variants` : draft.boxQuantity !== "" ? `${draft.boxQuantity} boxes` : "Pending"}</i>
              </button>)}
            </aside>
            {activeDraft && <div className="preorder-product-editor">
              <div className="preorder-editor-title"><div><span>PRODUCT {String(activeIndex + 1).padStart(2, "0")} / {String(drafts.length).padStart(2, "0")}</span><h3>Product details</h3></div><button type="button" className="preorder-remove-link" onClick={() => removeDraft(activeDraft.id)}>Remove image</button></div>
              <div className="preorder-editor-grid">
                <div className="preorder-main-photo"><img src={activeDraft.previewUrl} alt={activeDraft.productName} /><span>MAIN PRODUCT IMAGE</span></div>
                <div className="preorder-editor-fields">
                  <label className="preorder-field"><span>Product name</span><input value={activeDraft.productName} onChange={(e) => updateDraft(activeDraft.id, { productName: e.target.value })} placeholder="Enter product name" /></label>
                  <div className="preorder-field"><span>Quantity setup</span><div className="preorder-toggle">
                    <button type="button" className={activeDraft.quantityType === "boxes" ? "selected" : ""} onClick={() => updateDraft(activeDraft.id, { quantityType: "boxes" })}>Single box quantity</button>
                    <button type="button" className={activeDraft.quantityType === "variants" ? "selected" : ""} onClick={() => updateDraft(activeDraft.id, { quantityType: "variants" })}>Variants with box qty</button>
                  </div></div>
                  {activeDraft.quantityType === "boxes" ? <label className="preorder-field"><span>Number of boxes</span><input type="number" min="0" step="1" value={activeDraft.boxQuantity} onChange={(e) => updateDraft(activeDraft.id, { boxQuantity: e.target.value })} placeholder="e.g. 25" /></label> :
                    <div className="preorder-variants"><span className="preorder-field-label">Variants & box quantity</span>
                      <div className="preorder-variant-entry"><input value={activeDraft.variantName} onChange={(e) => updateDraft(activeDraft.id, { variantName: e.target.value })} placeholder="Variant name (e.g. 6 pcs box)" /><input type="number" min="0" step="1" value={activeDraft.variantBoxQuantity} onChange={(e) => updateDraft(activeDraft.id, { variantBoxQuantity: e.target.value })} placeholder="Boxes" /><button type="button" onClick={addVariant}>Add</button></div>
                      {activeDraft.variants.length > 0 && <div className="preorder-variant-list">{activeDraft.variants.map((variant, index) => <div key={index}><input value={variant.name} onChange={(e) => updateVariant(activeDraft.id, index, { name: e.target.value })} /><input aria-label="Box quantity" type="number" min="0" value={variant.boxQuantity} onChange={(e) => updateVariant(activeDraft.id, index, { boxQuantity: e.target.value })} /><button type="button" onClick={() => updateDraft(activeDraft.id, { variants: activeDraft.variants.filter((_, i) => i !== index) })}>×</button></div>)}</div>}
                    </div>}
                  <div className="preorder-field"><span>Additional product images <small>(optional)</small></span><input ref={additionalInputRef} type="file" accept="image/*" multiple hidden onChange={handleAdditionalImages} /><button type="button" className="preorder-secondary-button" onClick={() => additionalInputRef.current?.click()}>＋ Add additional images</button>
                    {activeDraft.additionalFiles.length > 0 && <div className="preorder-additional-grid">{activeDraft.additionalFiles.map((item, index) => <div key={item.previewUrl}><img src={item.previewUrl} alt="" /><button type="button" onClick={() => removeAdditional(activeDraft.id, index)}>×</button></div>)}</div>}
                  </div>
                  <label className="preorder-field"><span>Description / note <small>(optional)</small></span><textarea rows="3" value={activeDraft.description} onChange={(e) => updateDraft(activeDraft.id, { description: e.target.value })} placeholder="Add product details, material, sizes, delivery note..." /></label>
                </div>
              </div>
              <div className="preorder-editor-footer"><button type="button" className="preorder-secondary-button" disabled={activeIndex === 0} onClick={() => setActiveIndex((index) => index - 1)}>← Previous image</button><span>{activeIndex + 1} of {drafts.length}</span><button type="button" className="preorder-secondary-button" disabled={activeIndex === drafts.length - 1} onClick={() => setActiveIndex((index) => index + 1)}>Next image →</button></div>
            </div>}
          </div>
          <div className="preorder-save-row"><div><strong>Ready to save?</strong><span>Every main and additional image is converted to optimized WebP files before upload.</span></div><button type="button" className="preorder-primary-button" onClick={saveAll} disabled={saving}>{saving ? `Optimizing & saving ${saveProgress.completed}/${saveProgress.total}...` : `Save all ${drafts.length} products`}</button></div>
        </>}
      </section>

      <section className="preorder-panel preorder-saved-panel">
        <div className="preorder-section-heading"><div><span className="preorder-step">02</span><div><h2>Saved pre-order products</h2><p>Products saved separately from your regular inventory.</p></div></div><span className="preorder-count">{savedProducts.length} saved</span></div>
        {loadingSaved ? <p className="preorder-empty">Loading saved products...</p> : savedProducts.length === 0 ? <p className="preorder-empty">No pre-order products saved yet.</p> :
          <>
            <div className="preorder-saved-grid">{savedProducts.map((product) => <article className="preorder-saved-card" key={product.id}>
              <img src={product.thumbnail || product.image} alt={product.productName} />
              <div className="preorder-saved-info"><span>{product.categoryName || "Uncategorized"}</span><h3>{product.productName}</h3><p>{product.quantityType === "variants" ? (product.variants || []).map((v) => `${v.name}: ${v.boxQuantity} boxes`).join(" · ") : `${product.boxQuantity || 0} boxes`}</p><small>{product.additionalImages?.length || 0} additional images</small></div>
              <div className="preorder-card-actions">
                <button type="button" className="preorder-edit-button" onClick={() => openEditProduct(product)}>Edit</button>
                <button type="button" className="preorder-delete-button" onClick={() => deleteSavedProduct(product)}>Delete</button>
              </div>
            </article>)}</div>
            {hasMoreSaved && <div className="preorder-load-more-wrap"><button type="button" className="preorder-secondary-button" onClick={() => loadSavedProducts(false)} disabled={loadingMoreSaved}>{loadingMoreSaved ? "Loading..." : "Load next 20 products"}</button></div>}
            <p className="preorder-loaded-count">Showing {savedProducts.length} pre-order products{hasMoreSaved ? " · More available" : " · All products loaded"}</p>
          </>}
      </section>

      {editingProduct && editForm && <div className="preorder-modal-backdrop" role="presentation" onClick={(event) => {
        if (event.target === event.currentTarget && !editSaving) closeEditProduct();
      }}>
        <div className="preorder-edit-modal" role="dialog" aria-modal="true" aria-labelledby="preorder-edit-title">
          <div className="preorder-modal-heading">
            <div><span className="preorder-eyebrow">PRODUCT MANAGEMENT</span><h2 id="preorder-edit-title">Edit pre-order product</h2><p>Update product information, quantities and images.</p></div>
            <button type="button" onClick={closeEditProduct} disabled={editSaving} aria-label="Close">×</button>
          </div>
          <div className="preorder-modal-grid">
            <label className="preorder-field"><span>Product name</span><input value={editForm.productName} onChange={(e) => setEditForm((v) => ({ ...v, productName: e.target.value }))} /></label>
            <label className="preorder-field"><span>Category</span><select value={editForm.categoryId} onChange={(e) => setEditForm((v) => ({ ...v, categoryId: e.target.value }))}>{categories.map((category) => <option key={category.id} value={category.id}>{category.title || category.name || "Untitled category"}</option>)}</select></label>
          </div>
          <div className="preorder-field">
            <span>Quantity setup</span>
            <div className="preorder-toggle">
              <button type="button" className={editForm.quantityType === "boxes" ? "selected" : ""} onClick={() => setEditForm((v) => ({ ...v, quantityType: "boxes" }))}>Single box quantity</button>
              <button type="button" className={editForm.quantityType === "variants" ? "selected" : ""} onClick={() => setEditForm((v) => ({ ...v, quantityType: "variants" }))}>Variants with box qty</button>
            </div>
          </div>
          {editForm.quantityType === "boxes" ? <label className="preorder-field"><span>Number of boxes</span><input type="number" min="0" step="1" value={editForm.boxQuantity} onChange={(e) => setEditForm((v) => ({ ...v, boxQuantity: e.target.value }))} /></label> :
            <div className="preorder-field"><span>Variants and box quantities</span>
              {editForm.variants.map((variant, index) => <div className="preorder-edit-variant" key={index}>
                <input value={variant.name} placeholder="Variant name" onChange={(e) => updateEditVariant(index, { name: e.target.value })} />
                <input type="number" min="0" value={variant.boxQuantity} placeholder="Boxes" onChange={(e) => updateEditVariant(index, { boxQuantity: e.target.value })} />
                <button type="button" onClick={() => setEditForm((v) => ({ ...v, variants: v.variants.filter((_, i) => i !== index) }))}>×</button>
              </div>)}
              <button type="button" className="preorder-secondary-button" onClick={() => setEditForm((v) => ({ ...v, variants: [...v.variants, { name: "", boxQuantity: 0 }] }))}>＋ Add variant</button>
            </div>}
          <label className="preorder-field"><span>Description / note</span><textarea rows="3" value={editForm.description} onChange={(e) => setEditForm((v) => ({ ...v, description: e.target.value }))} /></label>
          <div className="preorder-modal-grid">
            <label className="preorder-field"><span>Replace main image <small>(optional)</small></span><input type="file" accept="image/*" onChange={(e) => setEditMainFile(e.target.files?.[0] || null)} />{editMainFile && <small>Selected: {editMainFile.name}</small>}</label>
            <label className="preorder-field"><span>Add more images <small>(optional)</small></span><input type="file" accept="image/*" multiple onChange={(e) => setEditAdditionalFiles(Array.from(e.target.files || []).filter((file) => file.type.startsWith("image/")))} />{editAdditionalFiles.length > 0 && <small>{editAdditionalFiles.length} image(s) selected</small>}</label>
          </div>
          <div className="preorder-modal-actions">
            <button type="button" className="preorder-secondary-button" onClick={closeEditProduct} disabled={editSaving}>Cancel</button>
            <button type="button" className="preorder-primary-button" onClick={saveEditedProduct} disabled={editSaving}>{editSaving ? "Saving changes..." : "Save changes"}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
