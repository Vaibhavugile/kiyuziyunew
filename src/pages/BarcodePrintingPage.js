import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import JsBarcode from "jsbarcode";
import html2pdf from "html2pdf.js";
import "./Barcode.css";
/* ======================================================
   BARCODE LABEL
====================================================== */
const BarcodeLabel = ({ product, subcollectionName }) => {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current) return;

    JsBarcode(svgRef.current, product.id, {
  format: "CODE128",
  width: 2.2,     // 🔥 thicker bars (better scan)
  height: 50,    // 🔥 taller barcode
  displayValue: false,
  margin: 2,
});

  }, [product.id]);

  return (
    <div className="barcode-label">
      <div className="barcode-text">
        <strong>{product.productName}</strong>
        <div>{subcollectionName}</div>
        <div>Code: {product.productCode}</div>
      </div>
      <svg ref={svgRef} />
    </div>
  );
};

/* ======================================================
   MAIN PAGE
====================================================== */
const BarcodePrintingPage = () => {
  const pdfRef = useRef(null);

  /* ================= STATE ================= */
  const [collections, setCollections] = useState([]);
  const [subcollections, setSubcollections] = useState([]);
  const [products, setProducts] = useState([]);

  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [selectedSubcollectionId, setSelectedSubcollectionId] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState([]);

  const [printLayout, setPrintLayout] = useState("A4"); // A4 | THERMAL

  /* ================= FETCH COLLECTIONS ================= */
  useEffect(() => {
    const fetchCollections = async () => {
      const snap = await getDocs(collection(db, "collections"));
      setCollections(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchCollections();
  }, []);

  /* ================= FETCH SUBCOLLECTIONS ================= */
  useEffect(() => {
    if (!selectedCollectionId) {
      setSubcollections([]);
      setProducts([]);
      setSelectedSubcollectionId("");
      setSelectedProductIds([]);
      return;
    }

    const fetchSubcollections = async () => {
      const snap = await getDocs(
        collection(db, "collections", selectedCollectionId, "subcollections")
      );
      setSubcollections(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };

    setSelectedProductIds([]);
    fetchSubcollections();
  }, [selectedCollectionId]);

  /* ================= FETCH PRODUCTS ================= */
 useEffect(() => {
  if (!selectedSubcollectionId) {
    setProducts([]);
    return;
  }

  const fetchProducts = async () => {

    const snap = await getDocs(
      collection(
        db,
        "collections",
        selectedCollectionId,
        "subcollections",
        selectedSubcollectionId,
        "products"
      )
    );

    const productsData = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
    }));

    // Sort newest first (supports timestamp OR createdAt)
    productsData.sort((a, b) => {
      const timeA = (a.timestamp || a.createdAt)?.seconds || 0;
      const timeB = (b.timestamp || b.createdAt)?.seconds || 0;
      return timeB - timeA;
    });

    setProducts(productsData);
  };

  setSelectedProductIds([]);
  fetchProducts();

}, [selectedSubcollectionId, selectedCollectionId]);
  /* ================= DERIVED ================= */
  const selectedProducts = useMemo(
    () => products.filter(p => selectedProductIds.includes(p.id)),
    [products, selectedProductIds]
  );

  const selectedSubcollectionName =
    subcollections.find(s => s.id === selectedSubcollectionId)?.name || "";

  /* ================= PDF EXPORT (✅ WORKING) ================= */
  const handleExportPDF = async () => {
    if (!pdfRef.current || selectedProducts.length === 0) return;

    const fileName =
      printLayout === "THERMAL"
        ? "barcodes-thermal.pdf"
        : "barcodes-a4.pdf";

    const options = {
      margin: 0,
      filename: fileName,
      image: { type: "jpeg", quality: 1 },
      html2canvas: {
        scale: 3,
        useCORS: true,
        backgroundColor: "#ffffff",
      },
      jsPDF: {
        unit: "mm",
        format: printLayout === "THERMAL" ? [50, 30] : "a4",
        orientation: "portrait",
      },
    };

    await html2pdf().set(options).from(pdfRef.current).save();
  };
const isNewProduct = (product) => {
  const timeField = product.timestamp || product.createdAt;

  if (!timeField) return false;

  const productTime = timeField.toDate().getTime();
  const now = Date.now();

  const diffHours = (now - productTime) / (1000 * 60 * 60);

  return diffHours <= 48;
};

  /* ================= UI ================= */
  return (
    <div className="admin-page">
      <h1>Barcode Printing</h1>

      <div className="form-group">
        <label>Collection</label>
        <select
          value={selectedCollectionId}
          onChange={e => setSelectedCollectionId(e.target.value)}
        >
          <option value="">Select Collection</option>
          {collections.map(c => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Subcollection</label>
        <select
          value={selectedSubcollectionId}
          onChange={e => setSelectedSubcollectionId(e.target.value)}
          disabled={!selectedCollectionId}
        >
          <option value="">Select Subcollection</option>
          {subcollections.map(s => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="product-actions-bar">
        <button
          onClick={() => setSelectedProductIds(products.map(p => p.id))}
          disabled={products.length === 0}
        >
          Select All Products
        </button>

        <button
          onClick={() => setSelectedProductIds([])}
          disabled={selectedProductIds.length === 0}
        >
          Clear Selection
        </button>

        <span className="selected-count">
          Selected: {selectedProductIds.length}
        </span>
      </div>

      <div className="admin-section product-grid">
        {products.map(product => (
          <label key={product.id} className="product-card">
            <input
              type="checkbox"
              checked={selectedProductIds.includes(product.id)}
              onChange={e =>
                setSelectedProductIds(prev =>
                  e.target.checked
                    ? [...prev, product.id]
                    : prev.filter(id => id !== product.id)
                )
              }
            />
            <div>
              <strong>
  {product.productName}
  {isNewProduct(product) && (
  <span className="new-badge">NEW</span>
)}
</strong>
              <div>{selectedSubcollectionName}</div>
              <small>Code: {product.productCode}</small>
            </div>
          </label>
        ))}
      </div>

      <div className="admin-section">
        <h3>Export Options</h3>

        <label>
          <input
            type="radio"
            checked={printLayout === "A4"}
            onChange={() => setPrintLayout("A4")}
          />
          A4 Sheet (PDF)
        </label>

        <label style={{ marginLeft: 20 }}>
          <input
            type="radio"
            checked={printLayout === "THERMAL"}
            onChange={() => setPrintLayout("THERMAL")}
          />
          2-inch Thermal (PDF)
        </label>
      </div>

      <button
        onClick={handleExportPDF}
        disabled={selectedProducts.length === 0}
        className="primary-btn"
      >
        📄 Export Barcodes as PDF ({selectedProducts.length})
      </button>

      {/* ✅ PDF EXPORT AREA */}
      <div
        ref={pdfRef}
        className={`print-area ${printLayout.toLowerCase()}`}
      >
        {selectedProducts.map(product => (
          <BarcodeLabel
            key={product.id}
            product={product}
            subcollectionName={selectedSubcollectionName}
          />
        ))}
      </div>
    </div>
  );
};

export default BarcodePrintingPage;