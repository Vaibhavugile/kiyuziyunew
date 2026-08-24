import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
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

      // Barcode width
      width: 1.8,

      // Barcode height
      height: 42,

      // We display product information separately
      displayValue: false,

      // Keep barcode compact for thermal label
      margin: 0,

      background: "#ffffff",

      lineColor: "#000000",
    });
  }, [product.id]);

  return (
    <div className="barcode-label">

      <div className="barcode-text">

        <strong>
          {product.productName}
        </strong>

        <div>
          {subcollectionName}
        </div>

        <div>
          Code: {product.productCode}
        </div>

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

  const [productQuantities, setProductQuantities] = useState({});

  const [printLayout, setPrintLayout] = useState("A4");
  // A4 | THERMAL


  /* ======================================================
     FETCH COLLECTIONS
  ====================================================== */

  useEffect(() => {

    const fetchCollections = async () => {

      try {

        const snap = await getDocs(
          collection(db, "collections")
        );

        setCollections(
          snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
          }))
        );

      } catch (error) {

        console.error(
          "Error fetching collections:",
          error
        );

      }

    };

    fetchCollections();

  }, []);


  /* ======================================================
     FETCH SUBCOLLECTIONS
  ====================================================== */

  useEffect(() => {

    if (!selectedCollectionId) {

      setSubcollections([]);
      setProducts([]);
      setSelectedSubcollectionId("");
      setSelectedProductIds([]);

      return;
    }


    const fetchSubcollections = async () => {

      try {

        const snap = await getDocs(
          collection(
            db,
            "collections",
            selectedCollectionId,
            "subcollections"
          )
        );

        setSubcollections(
          snap.docs.map(d => ({
            id: d.id,
            ...d.data(),
          }))
        );

      } catch (error) {

        console.error(
          "Error fetching subcollections:",
          error
        );

      }

    };


    setSelectedSubcollectionId("");
    setSelectedProductIds([]);

    fetchSubcollections();

  }, [selectedCollectionId]);


  /* ======================================================
     GET PRODUCT QUANTITY
  ====================================================== */

  const getProductQty = (product) => {

    const variants =
      product.variations ||
      product.variants ||
      product.variation ||
      [];


    if (
      Array.isArray(variants) &&
      variants.length > 0
    ) {

      return variants.reduce(
        (sum, v) =>
          sum + Number(v.quantity || 0),
        0
      );

    }


    return Number(product.quantity || 0);

  };


  /* ======================================================
     FETCH PRODUCTS
  ====================================================== */

  useEffect(() => {

    if (!selectedSubcollectionId) {

      setProducts([]);

      return;
    }


    const fetchProducts = async () => {

      try {

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


        const productsData = snap.docs

          .map(d => ({
            id: d.id,
            ...d.data(),
          }))

          .filter(
            product =>
              getProductQty(product) > 0
          );


        /* ===============================
           SORT NEWEST FIRST
        =============================== */

        productsData.sort((a, b) => {

          const timeA =
            (a.timestamp || a.createdAt)
              ?.seconds || 0;

          const timeB =
            (b.timestamp || b.createdAt)
              ?.seconds || 0;

          return timeB - timeA;

        });


        setProducts(productsData);

      } catch (error) {

        console.error(
          "Error fetching products:",
          error
        );

        setProducts([]);

      }

    };


    setSelectedProductIds([]);

    fetchProducts();

  }, [
    selectedSubcollectionId,
    selectedCollectionId,
  ]);


  /* ======================================================
     SELECTED PRODUCTS
  ====================================================== */

  const selectedProducts = useMemo(() => {

    const result = [];


    products.forEach(product => {

      if (
        !selectedProductIds.includes(
          product.id
        )
      ) {
        return;
      }


      const qty = Math.max(
        1,
        Number(
          productQuantities[product.id] || 1
        )
      );


      for (let i = 0; i < qty; i++) {

        result.push(product);

      }

    });


    return result;

  }, [
    products,
    selectedProductIds,
    productQuantities,
  ]);


  /* ======================================================
     SUBCOLLECTION NAME
  ====================================================== */

  const selectedSubcollectionName =
    subcollections.find(
      s => s.id === selectedSubcollectionId
    )?.name || "";


  /* ======================================================
     NEW PRODUCT CHECK
  ====================================================== */

  const isNewProduct = (product) => {

    const timeField =
      product.timestamp ||
      product.createdAt;


    if (!timeField) {
      return false;
    }


    try {

      const productTime =
        timeField.toDate().getTime();

      const now = Date.now();

      const diffHours =
        (now - productTime) /
        (1000 * 60 * 60);


      return (
        diffHours >= 0 &&
        diffHours <= 48
      );

    } catch (error) {

      return false;

    }

  };


  /* ======================================================
     PDF EXPORT
  ====================================================== */

  const handleExportPDF = async () => {

    if (
      !pdfRef.current ||
      selectedProducts.length === 0
    ) {
      return;
    }


    const isThermal =
      printLayout === "THERMAL";


    const fileName = isThermal
      ? "barcodes-50x30mm.pdf"
      : "barcodes-a4.pdf";


    /* ==================================================
       PDF OPTIONS
    ================================================== */

    const options = {

      margin: 0,

      filename: fileName,


      image: {
        type: "jpeg",
        quality: 1,
      },


      html2canvas: {

        scale: isThermal ? 4 : 3,

        useCORS: true,

        backgroundColor: "#ffffff",

        logging: false,

      },


      jsPDF: {
  unit: "mm",

  // Thermal = EXACT 50mm × 30mm
  // A4 mode keeps your existing letter page
  format: isThermal
    ? [50, 30]
    : "letter",

  // 50 × 30 is a landscape label
  orientation: isThermal
    ? "landscape"
    : "portrait",

  compress: true,
},

     

    };


    try {

      await html2pdf()
        .set(options)
        .from(pdfRef.current)
        .save();

    } catch (error) {

      console.error(
        "Barcode PDF export failed:",
        error
      );

    }

  };


  /* ======================================================
     UI
  ====================================================== */

  return (

    <div className="admin-page">

      <h1>
        Barcode Printing
      </h1>


      {/* ==================================================
          COLLECTION
      ================================================== */}

      <div className="form-group">

        <label>
          Collection
        </label>


        <select
          value={selectedCollectionId}
          onChange={e =>
            setSelectedCollectionId(
              e.target.value
            )
          }
        >

          <option value="">
            Select Collection
          </option>


          {collections.map(c => (

            <option
              key={c.id}
              value={c.id}
            >
              {c.title}
            </option>

          ))}

        </select>

      </div>


      {/* ==================================================
          SUBCOLLECTION
      ================================================== */}

      <div className="form-group">

        <label>
          Subcollection
        </label>


        <select
          value={selectedSubcollectionId}
          onChange={e =>
            setSelectedSubcollectionId(
              e.target.value
            )
          }
          disabled={!selectedCollectionId}
        >

          <option value="">
            Select Subcollection
          </option>


          {subcollections.map(s => (

            <option
              key={s.id}
              value={s.id}
            >
              {s.name}
            </option>

          ))}

        </select>

      </div>


      {/* ==================================================
          PRODUCT ACTIONS
      ================================================== */}

      <div className="product-actions-bar">

        <button
          onClick={() =>
            setSelectedProductIds(
              products.map(p => p.id)
            )
          }
          disabled={products.length === 0}
        >
          Select All Products
        </button>


        <button
          onClick={() =>
            setSelectedProductIds([])
          }
          disabled={
            selectedProductIds.length === 0
          }
        >
          Clear Selection
        </button>


        <span className="selected-count">

          Selected:{" "}
          {selectedProductIds.length}

        </span>

      </div>


      {/* ==================================================
          PRODUCT GRID
      ================================================== */}

      <div className="admin-section product-grid">

        {products.map(product => (

          <label
            key={product.id}
            className="barcodeproduct-card"
          >

            <input
              type="checkbox"

              checked={selectedProductIds.includes(
                product.id
              )}

              onChange={e => {

                setSelectedProductIds(prev =>

                  e.target.checked

                    ? [
                        ...prev,
                        product.id,
                      ]

                    : prev.filter(
                        id =>
                          id !== product.id
                      )

                );

              }}
            />


            {/* ==========================================
                QUANTITY
            ========================================== */}

            {selectedProductIds.includes(
              product.id
            ) && (

              <input

                type="number"

                min="1"

                value={
                  productQuantities[
                    product.id
                  ] || 1
                }

                onClick={e =>
                  e.stopPropagation()
                }

                onChange={e => {

                  const value =
                    Math.max(
                      1,
                      Number(
                        e.target.value
                      ) || 1
                    );


                  setProductQuantities(
                    prev => ({
                      ...prev,

                      [product.id]:
                        value,
                    })
                  );

                }}

                style={{
                  width: "70px",
                  marginTop: "8px",
                }}

              />

            )}


            {/* ==========================================
                PRODUCT INFORMATION
            ========================================== */}

            <div>

              <strong>

                {product.productName}


                {isNewProduct(product) && (

                  <span className="new-badge">
                    NEW
                  </span>

                )}

              </strong>


              <div>
                {selectedSubcollectionName}
              </div>


              <small>
                Code: {product.productCode}
              </small>

            </div>

          </label>

        ))}

      </div>


      {/* ==================================================
          EXPORT OPTIONS
      ================================================== */}

      <div className="admin-section">

        <h3>
          Export Options
        </h3>


        <label>

          <input
            type="radio"

            checked={
              printLayout === "A4"
            }

            onChange={() =>
              setPrintLayout("A4")
            }
          />

          A4 Sheet (PDF)

        </label>


        <label
          style={{
            marginLeft: 20,
          }}
        >

          <input
            type="radio"

            checked={
              printLayout === "THERMAL"
            }

            onChange={() =>
              setPrintLayout("THERMAL")
            }
          />

          50 × 30 mm Thermal (PDF)

        </label>

      </div>


      {/* ==================================================
          EXPORT BUTTON
      ================================================== */}

      <button

        onClick={handleExportPDF}

        disabled={
          selectedProducts.length === 0
        }

        className="primary-btn"
      >

        📄 Export Barcodes as PDF (
        {selectedProducts.length}
        )

      </button>


      {/* ==================================================
          PDF EXPORT AREA
      ================================================== */}

      <div
        ref={pdfRef}
        className={`print-area ${
          printLayout.toLowerCase()
        }`}
      >

        {selectedProducts.map(
          (product, index) => (

            <BarcodeLabel

              key={`${product.id}-${index}`}

              product={product}

              subcollectionName={
                selectedSubcollectionName
              }

            />

          )
        )}

      </div>

    </div>

  );
};


export default BarcodePrintingPage;