import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import JsBarcode from "jsbarcode";
import "./Barcode.css";


/* ======================================================
   BARCODE LABEL
====================================================== */

const BarcodeLabel = ({
  product,
  subcollectionName,
}) => {
  const svgRef = useRef(null);


  /* ====================================================
     GENERATE BARCODE
  ==================================================== */

  useEffect(() => {
    if (!svgRef.current) return;

    JsBarcode(svgRef.current, product.id, {
      format: "CODE128",

      // Optimized for 35 × 18 mm thermal label
      width: 1.5,

      // Barcode height
      height: 26,

      // Product information is displayed separately
      displayValue: false,

      // No extra whitespace around barcode
      margin: 0,

      background: "#ffffff",

      lineColor: "#000000",
    });
  }, [product.id]);


  /* ====================================================
     LABEL UI
  ==================================================== */

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

  /*
   * Used as the source for generated barcode labels.
   */
  const pdfRef = useRef(null);


  /* ====================================================
     STATE
  ==================================================== */

  const [collections, setCollections] = useState([]);

  const [subcollections, setSubcollections] =
    useState([]);

  const [products, setProducts] = useState([]);


  const [selectedCollectionId, setSelectedCollectionId] =
    useState("");

  const [selectedSubcollectionId, setSelectedSubcollectionId] =
    useState("");


  const [selectedProductIds, setSelectedProductIds] =
    useState([]);


  const [productQuantities, setProductQuantities] =
    useState({});


  /*
   * A4 | THERMAL
   */
  const [printLayout, setPrintLayout] =
    useState("A4");


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


    return Number(
      product.quantity || 0
    );

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


        /* ================================================
           SORT NEWEST FIRST
        ================================================= */

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
     
     Quantity is converted into duplicate labels.
     
     Example:
     Product A = quantity 3

     Result:
     Product A
     Product A
     Product A
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
     
     Product is considered NEW for 48 hours.
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
     PRINT
     
     IMPORTANT:
     - No PDF is generated.
     - No file is saved.
     - Browser native Print Dialog is used.
     - React DOM is never replaced.
     - Thermal printing uses an isolated iframe.
  ====================================================== */
const handlePrint = () => {
  /* =====================================================
     VALIDATION
  ===================================================== */

  if (
    !pdfRef.current ||
    selectedProducts.length === 0
  ) {
    return;
  }


  /* =====================================================
     PRINT TYPE
  ===================================================== */

  const isThermal =
    printLayout === "THERMAL";


  /* =====================================================
     IMPORTANT

     THERMAL LABEL:

       WIDTH  = 35mm
       HEIGHT = 18mm

     We DO NOT:

       - rotate it
       - swap 35 / 18
       - create an 18 × 35 wrapper

     Every barcode-label itself becomes one
     35 × 18mm printed page.
  ===================================================== */


  /* =====================================================
     CREATE PRINT IFRAME
  ===================================================== */

  const printIframe =
    document.createElement("iframe");


  printIframe.setAttribute(
    "aria-hidden",
    "true"
  );


  /*
   * Do NOT use display:none.
   */

  printIframe.style.position =
    "fixed";

  printIframe.style.left =
    "-10000px";

  printIframe.style.top =
    "0";


  /*
   * Give the iframe enough room for
   * the complete print document.
   */

  printIframe.style.width =
    isThermal
      ? "35mm"
      : "210mm";


  printIframe.style.height =
    isThermal
      ? "18mm"
      : "297mm";


  printIframe.style.border =
    "0";

  printIframe.style.margin =
    "0";

  printIframe.style.padding =
    "0";

  printIframe.style.background =
    "#ffffff";

  printIframe.style.opacity =
    "1";

  printIframe.style.pointerEvents =
    "none";


  document.body.appendChild(
    printIframe
  );


  /* =====================================================
     GET IFRAME DOCUMENT
  ===================================================== */

  const iframeDocument =
    printIframe.contentDocument;


  const iframeWindow =
    printIframe.contentWindow;


  if (
    !iframeDocument ||
    !iframeWindow
  ) {

    printIframe.remove();

    alert(
      "Unable to prepare the print document."
    );

    return;
  }


  /* =====================================================
     GET ALL GENERATED BARCODE LABELS
  ===================================================== */

  const sourceLabels =
    Array.from(
      pdfRef.current.querySelectorAll(
        ".barcode-label"
      )
    );


  console.log(
    "Barcode labels found:",
    sourceLabels.length
  );


  console.log(
    "Selected products:",
    selectedProducts.length
  );


  if (
    sourceLabels.length === 0
  ) {

    printIframe.remove();

    alert(
      "No barcode labels found to print."
    );

    return;
  }


  /* =====================================================
     CLONE EVERY LABEL
     
     IMPORTANT:
     We preserve EVERY label.
  ===================================================== */

  const labelsHTML =
    sourceLabels
      .map((label, index) => {

        const clone =
          label.cloneNode(true);


        /* ================================================
           PRESERVE SVG BARCODE
        ================================================ */

        const svg =
          clone.querySelector("svg");


        if (svg) {

          svg.setAttribute(
            "xmlns",
            "http://www.w3.org/2000/svg"
          );


          svg.setAttribute(
            "xmlns:xlink",
            "http://www.w3.org/1999/xlink"
          );

        }


        /*
         * Every barcode gets a unique print item.
         */

        clone.setAttribute(
          "data-print-index",
          String(index + 1)
        );


        return clone.outerHTML;

      })
      .join("\n");


  /* =====================================================
     THERMAL CSS
     
     IMPORTANT:
     
     ONE LABEL = ONE PAGE

     35mm × 18mm
  ===================================================== */

  const thermalCSS = `

    /* ================================================
       EXACT THERMAL PAPER
    ================================================= */

    @page {

      size: 35mm 18mm;

      margin: 0;

    }


    /* ================================================
       HTML
    ================================================= */

    html {

      margin: 0 !important;

      padding: 0 !important;

      width: 35mm !important;

      background: #ffffff !important;

    }


    /* ================================================
       BODY

       IMPORTANT:
       DO NOT FIX BODY HEIGHT TO 18mm.

       It needs to contain ALL labels.
    ================================================= */

    body {

      margin: 0 !important;

      padding: 0 !important;

      width: 35mm !important;

      min-width: 35mm !important;

      max-width: 35mm !important;


      height: auto !important;

      min-height: 0 !important;

      max-height: none !important;


      background: #ffffff !important;


      overflow: visible !important;


      -webkit-print-color-adjust:
        exact !important;

      print-color-adjust:
        exact !important;

    }


    /* ================================================
       PRINT CONTAINER

       IMPORTANT:
       NO fixed height.
    ================================================= */

    #thermal-print-container {

      width: 35mm !important;

      min-width: 35mm !important;

      max-width: 35mm !important;


      height: auto !important;

      min-height: 0 !important;

      max-height: none !important;


      margin: 0 !important;

      padding: 0 !important;


      display: block !important;


      background: #ffffff !important;


      overflow: visible !important;

    }


    /* ================================================
       EACH BARCODE

       ONE = ONE PHYSICAL PAGE

       35mm × 18mm
    ================================================= */

    #thermal-print-container
    .barcode-label {

      width: 35mm !important;

      min-width: 35mm !important;

      max-width: 35mm !important;


      height: 18mm !important;

      min-height: 18mm !important;

      max-height: 18mm !important;


      margin: 0 !important;

      padding: 1mm !important;


      box-sizing:
        border-box !important;


      background:
        #ffffff !important;


      display:
        flex !important;


      flex-direction:
        column !important;


      justify-content:
        center !important;


      align-items:
        center !important;


      text-align:
        center !important;


      font-family:
        Arial,
        Helvetica,
        sans-serif !important;


      overflow:
        hidden !important;


      border:
        none !important;


      /*
       * NO ROTATION
       */

      transform:
        none !important;


      transform-origin:
        center center !important;


      break-inside:
        avoid !important;


      page-break-inside:
        avoid !important;

    }


    /* ================================================
       PAGE BREAK BETWEEN LABELS

       Every label after the first starts
       on a new 35 × 18mm page.
    ================================================= */

    #thermal-print-container
    .barcode-label:not(:last-child) {

      page-break-after:
        always !important;


      break-after:
        page !important;

    }


    #thermal-print-container
    .barcode-label:last-child {

      page-break-after:
        auto !important;


      break-after:
        auto !important;

    }


    /* ================================================
       PRODUCT TEXT
    ================================================= */

    #thermal-print-container
    .barcode-text {

      width: 33mm !important;

      max-width: 33mm !important;


      margin:
        0 0 0.5mm 0 !important;


      padding:
        0 !important;


      text-align:
        center !important;


      line-height:
        1 !important;


      font-size:
        5.5pt !important;


      overflow:
        hidden !important;

    }


    /* ================================================
       PRODUCT NAME
    ================================================= */

    #thermal-print-container
    .barcode-text strong {

      display:
        block !important;


      width:
        100% !important;


      font-size:
        6.5pt !important;


      font-weight:
        bold !important;


      line-height:
        1 !important;


      white-space:
        nowrap !important;


      overflow:
        hidden !important;


      text-overflow:
        ellipsis !important;

    }


    /* ================================================
       SUBCOLLECTION + CODE
    ================================================= */

    #thermal-print-container
    .barcode-text div {

      width:
        100% !important;


      font-size:
        5pt !important;


      line-height:
        1 !important;


      white-space:
        nowrap !important;


      overflow:
        hidden !important;


      text-overflow:
        ellipsis !important;

    }


    /* ================================================
       BARCODE SVG

       31mm × 7mm
    ================================================= */

    #thermal-print-container
    .barcode-label svg {

      width:
        31mm !important;


      min-width:
        31mm !important;


      max-width:
        31mm !important;


      height:
        7mm !important;


      min-height:
        7mm !important;


      max-height:
        7mm !important;


      display:
        block !important;


      margin:
        0 !important;


      padding:
        0 !important;


      overflow:
        visible !important;

    }

  `;


  /* =====================================================
     A4 CSS
     
     A4 is completely separate.
  ===================================================== */

  const a4CSS = `

    @page {

      size: A4 portrait;

      margin: 0;

    }


    html {

      margin:
        0 !important;

      padding:
        0 !important;

      width:
        210mm !important;

    }


    body {

      margin:
        0 !important;

      padding:
        0 !important;

      width:
        210mm !important;

      background:
        #ffffff !important;


      -webkit-print-color-adjust:
        exact !important;


      print-color-adjust:
        exact !important;

    }


    #a4-print-container {

      width:
        210mm !important;


      min-height:
        297mm !important;


      margin:
        0 !important;


      padding:
        12.7mm 4.763mm !important;


      box-sizing:
        border-box !important;


      background:
        #ffffff !important;


      display:
        grid !important;


      grid-template-columns:
        repeat(
          3,
          66.675mm
        ) !important;


      grid-template-rows:
        repeat(
          10,
          25.4mm
        ) !important;


      column-gap:
        3.175mm !important;


      row-gap:
        0 !important;


      align-content:
        start !important;


      justify-content:
        start !important;

    }


    #a4-print-container
    .barcode-label {

      width:
        66.675mm !important;


      height:
        25.4mm !important;


      min-width:
        66.675mm !important;


      max-width:
        66.675mm !important;


      min-height:
        25.4mm !important;


      max-height:
        25.4mm !important;


      margin:
        0 !important;


      padding:
        2mm !important;


      box-sizing:
        border-box !important;


      background:
        #ffffff !important;


      display:
        flex !important;


      flex-direction:
        column !important;


      justify-content:
        center !important;


      align-items:
        center !important;


      text-align:
        center !important;


      font-family:
        Arial,
        Helvetica,
        sans-serif !important;


      overflow:
        hidden !important;


      border:
        none !important;


      break-inside:
        avoid !important;


      page-break-inside:
        avoid !important;

    }


    #a4-print-container
    .barcode-text {

      width:
        100% !important;


      text-align:
        center !important;


      margin-bottom:
        2mm !important;


      line-height:
        1.1 !important;


      font-size:
        8pt !important;


      overflow:
        hidden !important;

    }


    #a4-print-container
    .barcode-text strong {

      display:
        block !important;


      font-size:
        9pt !important;


      font-weight:
        bold !important;


      white-space:
        nowrap !important;


      overflow:
        hidden !important;


      text-overflow:
        ellipsis !important;

    }


    #a4-print-container
    .barcode-text div {

      font-size:
        7pt !important;


      white-space:
        nowrap !important;


      overflow:
        hidden !important;


      text-overflow:
        ellipsis !important;

    }


    #a4-print-container
    .barcode-label svg {

      width:
        58mm !important;


      height:
        12mm !important;


      display:
        block !important;


      margin:
        0 !important;

    }

  `;


  /* =====================================================
     SELECT PRINT CSS
  ===================================================== */

  const printCSS =
    isThermal
      ? thermalCSS
      : a4CSS;


  /* =====================================================
     SELECT CONTAINER
  ===================================================== */

  const containerId =
    isThermal
      ? "thermal-print-container"
      : "a4-print-container";


  /* =====================================================
     BUILD COMPLETE PRINT DOCUMENT
  ===================================================== */

  const pageHTML = `

    <!DOCTYPE html>

    <html>

      <head>

        <meta charset="UTF-8" />

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />

        <title>
          Barcode Printing
        </title>


        <style>

          ${printCSS}

        </style>

      </head>


      <body>

        <div id="${containerId}">

          ${labelsHTML}

        </div>

      </body>

    </html>

  `;


  /* =====================================================
     WRITE DOCUMENT
  ===================================================== */

  iframeDocument.open();

  iframeDocument.write(
    pageHTML
  );

  iframeDocument.close();


  /* =====================================================
     PRINT STATE
  ===================================================== */

  let printStarted =
    false;

  let cleanedUp =
    false;


  /* =====================================================
     CLEANUP
  ===================================================== */

  const cleanup = () => {

    if (cleanedUp) {
      return;
    }


    cleanedUp =
      true;


    try {

      iframeWindow.removeEventListener(
        "afterprint",
        cleanup
      );

    } catch (error) {

      // Ignore cleanup errors.

    }


    setTimeout(() => {

      if (
        printIframe.parentNode
      ) {

        printIframe.parentNode.removeChild(
          printIframe
        );

      }

    }, 500);

  };


  iframeWindow.addEventListener(
    "afterprint",
    cleanup
  );


  /* =====================================================
     START PRINT
  ===================================================== */

  const startPrint =
    async () => {

      if (
        printStarted ||
        cleanedUp
      ) {
        return;
      }


      printStarted =
        true;


      /* ================================================
         WAIT FOR FONTS
      ================================================ */

      try {

        if (
          iframeDocument.fonts &&
          iframeDocument.fonts.ready
        ) {

          await iframeDocument.fonts.ready;

        }

      } catch (error) {

        console.warn(
          "Font loading check skipped:",
          error
        );

      }


      /* ================================================
         VERIFY LABEL COUNT
         
         This is important for debugging.
      ================================================ */

      const printedLabels =
        iframeDocument.querySelectorAll(
          ".barcode-label"
        );


      console.log(
        "PRINT DOCUMENT LABEL COUNT:",
        printedLabels.length
      );


      console.log(
        "EXPECTED LABEL COUNT:",
        selectedProducts.length
      );


      /* ================================================
         WAIT FOR SVG PAINT
      ================================================ */

      requestAnimationFrame(() => {

        requestAnimationFrame(() => {

          setTimeout(() => {

            try {

              iframeWindow.focus();

              iframeWindow.print();

            } catch (error) {

              console.error(
                "Barcode print failed:",
                error
              );


              printStarted =
                false;


              cleanup();

            }

          }, 500);

        });

      });

    };


  /* =====================================================
     WAIT FOR IFRAME
  ===================================================== */

  if (
    iframeDocument.readyState ===
      "complete" ||
    iframeDocument.readyState ===
      "interactive"
  ) {

    startPrint();

  } else {

    iframeWindow.addEventListener(
      "load",
      startPrint,
      {
        once: true
      }
    );

  }


  /* =====================================================
     FALLBACK
  ===================================================== */

  setTimeout(() => {

    if (
      !printStarted &&
      !cleanedUp
    ) {

      startPrint();

    }

  }, 1500);

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
          disabled={
            !selectedCollectionId
          }
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
              products.map(
                p => p.id
              )
            )
          }
          disabled={
            products.length === 0
          }
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

              checked={
                selectedProductIds.includes(
                  product.id
                )
              }

              onChange={e => {

                setSelectedProductIds(
                  prev =>

                    e.target.checked

                      ? [
                          ...prev,
                          product.id,
                        ]

                      : prev.filter(
                          id =>
                            id !==
                            product.id
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


                {isNewProduct(
                  product
                ) && (

                  <span className="new-badge">
                    NEW
                  </span>

                )}

              </strong>


              <div>
                {selectedSubcollectionName}
              </div>


              <small>
                Code:{" "}
                {product.productCode}
              </small>

            </div>

          </label>

        ))}

      </div>


      {/* ==================================================
          PRINT OPTIONS
      ================================================== */}

      <div className="admin-section">

        <h3>
          Print Options
        </h3>


        {/* ================================================
            A4
        ================================================= */}

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

          A4 Sheet

        </label>


        {/* ================================================
            THERMAL 35 × 18 MM
        ================================================= */}

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
              setPrintLayout(
                "THERMAL"
              )
            }
          />

          35 × 18 mm Thermal

        </label>

      </div>


      {/* ==================================================
          PRINT BUTTON
      ================================================== */}

      <button

        onClick={handlePrint}

        disabled={
          selectedProducts.length === 0
        }

        className="primary-btn"
      >

        🖨️ Print Barcodes (
        {selectedProducts.length}
        )

      </button>


      {/* ==================================================
          PRINT AREA
          
          This remains in the React page as the source
          for the generated barcode SVGs.
          
          Actual printing is handled by handlePrint().
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