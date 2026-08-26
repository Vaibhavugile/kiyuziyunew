import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  collection,
  getDocs,
} from "firebase/firestore";

import { db } from "../firebase";
import QRCode from "qrcode";

import "./Barcode.css";

/* =========================================================
   SCREEN PREVIEW LABEL
   ========================================================= */

const BarcodeLabel = ({
  product,
  subcollectionName,
}) => {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current) return;

    const generateQRCode = async () => {
      svgRef.current.innerHTML = "";

      const productId = String(
        product?.id || ""
      ).trim();

      if (!productId) return;

      try {
        const qrSvg = await QRCode.toString(
          productId,
          {
            type: "svg",
            errorCorrectionLevel: "L",
            margin: 0,
            color: {
              dark: "#000000",
              light: "#ffffff",
            },
          }
        );

        const parser = new DOMParser();

        const qrDocument =
          parser.parseFromString(
            qrSvg,
            "image/svg+xml"
          );

        const generatedSvg =
          qrDocument.documentElement;

        Array.from(
          generatedSvg.attributes
        ).forEach((attribute) => {
          svgRef.current.setAttribute(
            attribute.name,
            attribute.value
          );
        });

        Array.from(
          generatedSvg.childNodes
        ).forEach((node) => {
          svgRef.current.appendChild(
            node.cloneNode(true)
          );
        });

        svgRef.current.setAttribute(
          "data-qr-value",
          productId
        );

        svgRef.current.setAttribute(
          "preserveAspectRatio",
          "xMidYMid meet"
        );

        svgRef.current.style.display = "block";
        svgRef.current.style.margin = "0";
        svgRef.current.style.padding = "0";
        svgRef.current.style.overflow = "visible";
      } catch (error) {
        console.error(
          "QR generation failed:",
          error
        );
      }
    };

    generateQRCode();
  }, [product?.id]);

  return (
    <div className="barcode-label">

      <div className="barcode-text">
        <strong>
          {product?.productName ||
            product?.name ||
            ""}
        </strong>

        <div>
          {subcollectionName}
        </div>

        <div>
          Code:{" "}
          {product?.productCode || "-"}
        </div>
      </div>

      <svg
        ref={svgRef}
        data-product-id={String(
          product?.id || ""
        ).trim()}
      />

    </div>
  );
};


/* =========================================================
   MAIN PAGE
   ========================================================= */

const BarcodePrintingPage = () => {
  const pdfRef = useRef(null);

  /* =======================================================
     STATE
     ======================================================= */

  const [
    collections,
    setCollections,
  ] = useState([]);

  const [
    subcollections,
    setSubcollections,
  ] = useState([]);

  const [
    products,
    setProducts,
  ] = useState([]);

  const [
    selectedCollectionId,
    setSelectedCollectionId,
  ] = useState("");

  const [
    selectedSubcollectionId,
    setSelectedSubcollectionId,
  ] = useState("");

  const [
    selectedProductIds,
    setSelectedProductIds,
  ] = useState([]);

  const [
    productQuantities,
    setProductQuantities,
  ] = useState({});

  /*
   * DEFAULT:
   * 32.5 × 18 mm
   */

  const [
    printLayout,
    setPrintLayout,
  ] = useState(
    "THERMAL_32_5X18"
  );


  /* =======================================================
     FETCH COLLECTIONS
     ======================================================= */

  useEffect(() => {
    const fetchCollections = async () => {
      try {
        const snap = await getDocs(
          collection(
            db,
            "collections"
          )
        );

        setCollections(
          snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
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


  /* =======================================================
     FETCH SUBCOLLECTIONS
     ======================================================= */

  useEffect(() => {
    if (!selectedCollectionId) {
      setSubcollections([]);
      setProducts([]);
      setSelectedSubcollectionId("");
      setSelectedProductIds([]);
      setProductQuantities({});
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
          snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
        );
      } catch (error) {
        console.error(
          "Error fetching subcollections:",
          error
        );

        setSubcollections([]);
      }
    };

    setSelectedSubcollectionId("");
    setProducts([]);
    setSelectedProductIds([]);
    setProductQuantities({});

    fetchSubcollections();
  }, [selectedCollectionId]);


  /* =======================================================
     FETCH PRODUCTS
     ======================================================= */

  useEffect(() => {
    if (
      !selectedCollectionId ||
      !selectedSubcollectionId
    ) {
      setProducts([]);
      setSelectedProductIds([]);
      setProductQuantities({});
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

        const productList =
          snap.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));

        setProducts(productList);
        setSelectedProductIds([]);
        setProductQuantities({});
      } catch (error) {
        console.error(
          "Error fetching products:",
          error
        );

        setProducts([]);
      }
    };

    fetchProducts();
  }, [
    selectedCollectionId,
    selectedSubcollectionId,
  ]);


  /* =======================================================
     SUBCOLLECTION NAME
     ======================================================= */

  const selectedSubcollectionName =
    useMemo(() => {
      const found =
        subcollections.find(
          (item) =>
            item.id ===
            selectedSubcollectionId
        );

      return (
        found?.name ||
        found?.subcollectionName ||
        found?.title ||
        ""
      );
    }, [
      subcollections,
      selectedSubcollectionId,
    ]);


  /* =======================================================
     SELECTED PRODUCTS
     ======================================================= */

  const selectedProducts = useMemo(() => {
    return products.filter((product) =>
      selectedProductIds.includes(
        product.id
      )
    );
  }, [
    products,
    selectedProductIds,
  ]);


  /* =======================================================
     EXPAND QUANTITY
     ======================================================= */

  const printableProducts = useMemo(() => {
    const result = [];

    selectedProducts.forEach((product) => {
      const quantity = Math.max(
        1,
        Number(
          productQuantities[
            product.id
          ] || 1
        )
      );

      for (
        let i = 0;
        i < quantity;
        i++
      ) {
        result.push({
          ...product,
          __printIndex: i,
        });
      }
    });

    return result;
  }, [
    selectedProducts,
    productQuantities,
  ]);


  /* =======================================================
     NEW PRODUCT
     ======================================================= */

  const isNewProduct = (product) => {
    if (!product) return false;

    const createdAt =
      product.createdAt ||
      product.created_at ||
      product.createdDate;

    if (!createdAt) return false;

    let createdDate;

    if (
      typeof createdAt?.toDate ===
      "function"
    ) {
      createdDate = createdAt.toDate();
    } else {
      createdDate = new Date(createdAt);
    }

    if (
      Number.isNaN(
        createdDate.getTime()
      )
    ) {
      return false;
    }

    const difference =
      Date.now() -
      createdDate.getTime();

    const sevenDays =
      7 *
      24 *
      60 *
      60 *
      1000;

    return (
      difference >= 0 &&
      difference <= sevenDays
    );
  };


  /* =======================================================
     TOGGLE PRODUCT
     ======================================================= */

  const toggleProduct = (productId) => {
    setSelectedProductIds(
      (previous) => {
        if (
          previous.includes(productId)
        ) {
          return previous.filter(
            (id) => id !== productId
          );
        }

        return [
          ...previous,
          productId,
        ];
      }
    );

    setProductQuantities(
      (previous) => {
        if (previous[productId]) {
          return previous;
        }

        return {
          ...previous,
          [productId]: 1,
        };
      }
    );
  };


  /* =======================================================
     SELECT ALL
     ======================================================= */

  const selectAllProducts = () => {
    const ids = products.map(
      (product) => product.id
    );

    const quantities = {};

    ids.forEach((id) => {
      quantities[id] =
        productQuantities[id] || 1;
    });

    setSelectedProductIds(ids);
    setProductQuantities(quantities);
  };


  /* =======================================================
     CLEAR ALL
     ======================================================= */

  const clearAllProducts = () => {
    setSelectedProductIds([]);
    setProductQuantities({});
  };


  /* =======================================================
     TOTAL LABELS
     ======================================================= */

  const totalLabelCount =
    printableProducts.length;


  /* =======================================================
     TSC PNR CONFIGURATION

     IMPORTANT:

     PNR FORMAT:

     QR = LEFT
     TEXT = RIGHT

     NO CSS ROTATION.

     Product ID is the QR payload.
     ======================================================= */

  const PRINT_CONFIGS = {

    /* =====================================================
       FORMAT 1
       PNR:

       SIZE 47.5 mm, 25 mm

       QRCODE 333,127,L,4,A,180,M2,S7

       TEXT 330,176,"0",180,12,12
       TEXT 200,127,"0",180,12,12
       TEXT 200,76,"0",180,12,12
       ===================================================== */
THERMAL_47_5X25: {
  width: 47.5,
  height: 25,

  // QR LEFT
  qrX: 2.0,
  qrY: 3.5,
  qrSize: 18.0,

  // TEXT RIGHT
  textX: 21.0,
  textWidth: 24.5,

  // PRODUCT NAME
  titleY: 3.2,
  titleFont: 12,

  // SUBCOLLECTION
  subY: 10.5,
  subFont: 10,

  // PRODUCT CODE
  codeY: 15.0,
  codeFont: 10,
},

    /* =====================================================
       FORMAT 2

       SIZE 32.5 mm, 18 mm

       QRCODE 224,84,L,3,A,180,M2,S7

       TEXT 234,120,"0",180,10,9
       TEXT 136,85,"0",180,9,9
       TEXT 136,48,"0",180,9,9
       ===================================================== */

   THERMAL_32_5X18: {
  width: 32.5,
  height: 18,

  // QR LEFT
  qrX: 1.5,
  qrY: 3.5,
  qrSize: 11.0,

  // TEXT RIGHT
  textX: 14.0,
  textWidth: 17.0,

  titleY: 2.2,
  titleFont: 9,

  subY: 6.8,
  subFont: 8,

  codeY: 10.8,
  codeFont: 8,
},
  };


  const currentPrintConfig =
    PRINT_CONFIGS[
      printLayout
    ] ||
    PRINT_CONFIGS
      .THERMAL_32_5X18;


  /* =======================================================
     HTML ESCAPE
     ======================================================= */

  const escapeHtml = (value) => {
    return String(value ?? "")
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#039;"
      );
  };


  /* =======================================================
     GENERATE PRINT QR

     ONLY FIRESTORE PRODUCT ID
     ======================================================= */

  const createPrintQR = async (productId) => {
  if (!productId) return "";

  try {
    const qrSvg = await QRCode.toString(
      String(productId),
      {
        type: "svg",
        errorCorrectionLevel: "L",
        margin: 0,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
      }
    );

    // Add our print class directly to the REAL QR SVG.
    // Do NOT put this SVG inside another SVG.
    return qrSvg.replace(
      "<svg ",
      '<svg class="print-qr" '
    );

  } catch (error) {
    console.error(
      "Print QR generation failed:",
      error
    );

    return "";
  }
};

  /* =======================================================
     BUILD ONE PRINT LABEL
     ======================================================= */

  const buildPrintLabel = async (
    product,
    config
  ) => {

    /* FIRESTORE DOCUMENT ID ONLY */

    const productId = String(
      product?.id || ""
    ).trim();

    if (!productId) return "";

    const productName = String(
      product?.productName ||
        product?.name ||
        ""
    );

    const subcollection = String(
      selectedSubcollectionName ||
        ""
    );

    const productCode = String(
      product?.productCode ||
        ""
    );

    const qr =
      await createPrintQR(
        productId
      );

    return `
      <div
        class="print-label"
        data-product-id="${escapeHtml(
          productId
        )}"
      >

        <!-- QR CODE LEFT -->

        ${qr}


        <!-- PRODUCT NAME RIGHT -->

        <div class="print-product-name">
          ${escapeHtml(
            productName
          )}
        </div>


        <!-- SUBCOLLECTION RIGHT -->

        <div class="print-subcollection">
          ${escapeHtml(
            subcollection
          )}
        </div>


        <!-- PRODUCT CODE RIGHT -->

        <div class="print-product-code">
          Code:
          ${escapeHtml(
            productCode
          )}
        </div>

      </div>
    `;
  };


  /* =======================================================
     PRINT
     ======================================================= */

  const handlePrint = async () => {

    if (
      printableProducts.length ===
      0
    ) {
      alert(
        "Please select at least one product."
      );
      return;
    }

    const config =
      currentPrintConfig;

    /*
     * Open immediately.
     * This prevents popup blocking.
     */

    const printWindow =
      window.open(
        "",
        "_blank",
        "width=600,height=800"
      );

    if (!printWindow) {
      alert(
        "Please allow pop-ups for printing."
      );
      return;
    }


    /* =====================================================
       BUILD ALL LABELS
       ===================================================== */

    const labels = [];

    for (
      const product of
      printableProducts
    ) {
      const html =
        await buildPrintLabel(
          product,
          config
        );

      if (html) {
        labels.push(html);
      }
    }

    const labelsHTML =
      labels.join("");


    /* =====================================================
       PRINT WINDOW
       ===================================================== */

    printWindow.document.open();

    printWindow.document.write(`
      <!DOCTYPE html>

      <html>

        <head>

          <meta charset="UTF-8" />

          <title>
            QR Labels
          </title>


          <style>

            /* =========================================
               EXACT TSC LABEL PAGE
               ========================================= */

            @page {
              size:
                ${config.width}mm
                ${config.height}mm;

              margin:
                0 !important;
            }


            /* =========================================
               RESET
               ========================================= */

            *,
            *::before,
            *::after {
              box-sizing:
                border-box !important;
            }


            html {
              width:
                ${config.width}mm !important;

              height:
                ${config.height}mm !important;

              margin:
                0 !important;

              padding:
                0 !important;
            }


            body {
              width:
                ${config.width}mm !important;

              min-width:
                ${config.width}mm !important;

              max-width:
                ${config.width}mm !important;

              margin:
                0 !important;

              padding:
                0 !important;

              background:
                #ffffff !important;

              font-family:
                Arial,
                Helvetica,
                sans-serif !important;

              overflow:
                visible !important;
            }


            /* =========================================
               ONE LABEL
               ========================================= */

            .print-label {

              position:
                relative !important;

              width:
                ${config.width}mm !important;

              min-width:
                ${config.width}mm !important;

              max-width:
                ${config.width}mm !important;

              height:
                ${config.height}mm !important;

              min-height:
                ${config.height}mm !important;

              max-height:
                ${config.height}mm !important;

              margin:
                0 !important;

              padding:
                0 !important;

              background:
                #ffffff !important;

              overflow:
                hidden !important;

              page-break-after:
                always !important;

              break-after:
                page !important;
            }


            .print-label:last-child {
              page-break-after:
                auto !important;

              break-after:
                auto !important;
            }


            /* =========================================
               PRODUCT NAME
               RIGHT SIDE
               ========================================= */

            .print-product-name {

              position:
                absolute !important;

              left:
                ${config.textX}mm !important;

              top:
                ${config.titleY}mm !important;

              width:
                ${config.textWidth}mm !important;

              margin:
                0 !important;

              padding:
                0 !important;

              text-align:
                center !important;

              font-family:
                Arial,
                Helvetica,
                sans-serif !important;

              font-size:
                ${config.titleFont}pt !important;

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

              transform:
                none !important;
            }


            /* =========================================
               SUBCOLLECTION
               RIGHT SIDE
               ========================================= */

            .print-subcollection {

              position:
                absolute !important;

              left:
                ${config.textX}mm !important;

              top:
                ${config.subY}mm !important;

              width:
                ${config.textWidth}mm !important;

              margin:
                0 !important;

              padding:
                0 !important;

              text-align:
                center !important;

              font-family:
                Arial,
                Helvetica,
                sans-serif !important;

              font-size:
                ${config.subFont}pt !important;

              font-weight:
                normal !important;

              line-height:
                1 !important;

              white-space:
                nowrap !important;

              overflow:
                hidden !important;

              text-overflow:
                ellipsis !important;

              transform:
                none !important;
            }


            /* =========================================
               PRODUCT CODE
               RIGHT SIDE
               ========================================= */

            .print-product-code {

              position:
                absolute !important;

              left:
                ${config.textX}mm !important;

              top:
                ${config.codeY}mm !important;

              width:
                ${config.textWidth}mm !important;

              margin:
                0 !important;

              padding:
                0 !important;

              text-align:
                center !important;

              font-family:
                Arial,
                Helvetica,
                sans-serif !important;

              font-size:
                ${config.codeFont}pt !important;

              font-weight:
                normal !important;

              line-height:
                1 !important;

              white-space:
                nowrap !important;

              overflow:
                hidden !important;

              text-overflow:
                ellipsis !important;

              transform:
                none !important;
            }


            /* =========================================
               QR CODE
               LEFT SIDE
               ========================================= */

            /* =========================================
   QR CODE
   REAL QR SVG
   ========================================= */

.print-qr {
  position: absolute !important;

  left: ${config.qrX}mm !important;
  top: ${config.qrY}mm !important;

  width: ${config.qrSize}mm !important;
  height: ${config.qrSize}mm !important;

  min-width: ${config.qrSize}mm !important;
  min-height: ${config.qrSize}mm !important;

  max-width: ${config.qrSize}mm !important;
  max-height: ${config.qrSize}mm !important;

  display: block !important;

  margin: 0 !important;
  padding: 0 !important;

  overflow: visible !important;

  box-sizing: border-box !important;

  transform: none !important;

  transform-origin: center center !important;

  shape-rendering: crispEdges !important;
}

.print-qr rect,
.print-qr path {
  shape-rendering: crispEdges !important;
}


            


            /* =========================================
               PRINT
               ========================================= */

            @media print {

              @page {
                size:
                  ${config.width}mm
                  ${config.height}mm !important;

                margin:
                  0 !important;
              }


              html,
              body {

                width:
                  ${config.width}mm !important;

                height:
                  ${config.height}mm !important;

                margin:
                  0 !important;

                padding:
                  0 !important;
              }


              .print-label {

                width:
                  ${config.width}mm !important;

                height:
                  ${config.height}mm !important;

                margin:
                  0 !important;

                padding:
                  0 !important;
              }
            }

          </style>

        </head>


        <body>

          ${labelsHTML}

        </body>

      </html>
    `);

    printWindow.document.close();


    /* =====================================================
       WAIT FOR QR RENDER
       ===================================================== */

    setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch (error) {
        console.error(
          "Printing failed:",
          error
        );
      }
    }, 800);


    printWindow.onafterprint = () => {
      setTimeout(() => {
        try {
          printWindow.close();
        } catch (error) {
          console.error(error);
        }
      }, 300);
    };
  };


  /* =======================================================
     RENDER
     ======================================================= */

  return (
    <div className="admin-page">

      {/* =================================================
          PAGE TITLE
          ================================================= */}

      <div className="product-title">
        <h1>
          Barcode / QR Printing
        </h1>
      </div>


      {/* =================================================
          COLLECTION
          ================================================= */}

      <div className="admin-section">

        <h3>
          Select Collection
        </h3>

        <div className="form-group">

          <label>
            Collection
          </label>

          <select
            value={
              selectedCollectionId
            }
            onChange={(event) => {
              setSelectedCollectionId(
                event.target.value
              );
            }}
          >

            <option value="">
              Select Collection
            </option>

            {collections.map(
              (collectionItem) => (
                <option
                  key={
                    collectionItem.id
                  }
                  value={
                    collectionItem.id
                  }
                >
                  {
                    collectionItem.name ||
                    collectionItem.title ||
                    collectionItem.id
                  }
                </option>
              )
            )}

          </select>

        </div>


        {/* =============================================
            SUBCOLLECTION
            ============================================= */}

        <div className="form-group">

          <label>
            Subcollection
          </label>

          <select
            value={
              selectedSubcollectionId
            }
            onChange={(event) => {
              setSelectedSubcollectionId(
                event.target.value
              );
            }}
            disabled={
              !selectedCollectionId
            }
          >

            <option value="">
              Select Subcollection
            </option>

            {subcollections.map(
              (subcollection) => (
                <option
                  key={
                    subcollection.id
                  }
                  value={
                    subcollection.id
                  }
                >
                  {
                    subcollection.name ||
                    subcollection.subcollectionName ||
                    subcollection.title ||
                    subcollection.id
                  }
                </option>
              )
            )}

          </select>

        </div>

      </div>


      {/* =================================================
          PRINT FORMAT
          ================================================= */}

      <div className="admin-section">

        <h3>
          Print Format
        </h3>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >

          {/* =========================================
              32.5 × 18
              ========================================= */}

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "9px",
              cursor: "pointer",
            }}
          >

            <input
              type="radio"
              name="print-layout"
              value="THERMAL_32_5X18"
              checked={
                printLayout ===
                "THERMAL_32_5X18"
              }
              onChange={(event) => {
                setPrintLayout(
                  event.target.value
                );
              }}
            />

            <span>
              32.5 × 18 mm
            </span>

          </label>


          {/* =========================================
              47.5 × 25
              ========================================= */}

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "9px",
              cursor: "pointer",
            }}
          >

            <input
              type="radio"
              name="print-layout"
              value="THERMAL_47_5X25"
              checked={
                printLayout ===
                "THERMAL_47_5X25"
              }
              onChange={(event) => {
                setPrintLayout(
                  event.target.value
                );
              }}
            />

            <span>
              47.5 × 25 mm
            </span>

          </label>

        </div>


        <div
          style={{
            marginTop: "14px",
            padding: "10px 12px",
            background: "#f3f4f6",
            borderRadius: "6px",
            fontSize: "13px",
            color: "#374151",
          }}
        >

          <strong>
            QR:
          </strong>{" "}

          Firestore Product ID only

          {" • "}

          Error correction: L

          {" • "}

          TSC PNR compatible

          {" • "}

          QR left / Text right

        </div>

      </div>


      {/* =================================================
          PRODUCTS
          ================================================= */}

      {selectedSubcollectionId && (
        <div className="admin-section">

          <h3>
            Products
          </h3>


          {/* =========================================
              ACTION BAR
              ========================================= */}

          <div
            className="product-actions-bar"
          >

            <button
              type="button"
              onClick={
                selectAllProducts
              }
              disabled={
                products.length === 0
              }
            >
              Select All
            </button>


            <button
              type="button"
              onClick={
                clearAllProducts
              }
              disabled={
                selectedProductIds.length ===
                0
              }
            >
              Clear All
            </button>


            <span
              className="selected-count"
            >
              {
                selectedProductIds.length
              }{" "}
              selected
            </span>


            <span
              className="selected-count"
            >
              {totalLabelCount}{" "}
              label
              {totalLabelCount === 1
                ? ""
                : "s"}
            </span>

          </div>


          {/* =========================================
              PRODUCT LIST
              ========================================= */}

          {products.length === 0 ? (

            <div
              style={{
                padding: "20px",
                color: "#6b7280",
                textAlign: "center",
              }}
            >
              No products found.
            </div>

          ) : (

            <div className="product-grid">

              {products.map(
                (product) => {

                  const selected =
                    selectedProductIds.includes(
                      product.id
                    );

                  const quantity =
                    productQuantities[
                      product.id
                    ] || 1;

                  return (
                    <div
                      key={product.id}
                      className={
                        `barcodeproduct-card ${
                          selected
                            ? "selected"
                            : ""
                        }`
                      }
                      onClick={() => {
                        toggleProduct(
                          product.id
                        );
                      }}
                    >

                      {/* CHECKBOX */}

                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {
                          toggleProduct(
                            product.id
                          );
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                      />


                      {/* PRODUCT INFORMATION */}

                      <div
                        style={{
                          flex: 1,
                          minWidth: 0,
                        }}
                      >

                        <strong>

                          {
                            product.productName ||
                            product.name ||
                            "Unnamed Product"
                          }

                          {isNewProduct(
                            product
                          ) && (
                            <span className="new-badge">
                              NEW
                            </span>
                          )}

                        </strong>


                        <small>
                          Product ID:{" "}
                          {product.id}
                        </small>


                        {product.productCode && (
                          <small>
                            Code:{" "}
                            {
                              product.productCode
                            }
                          </small>
                        )}


                        {/* QUANTITY */}

                        {selected && (
                          <div
                            style={{
                              marginTop: "10px",
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                          >

                            <label
                              style={{
                                display: "flex",
                                alignItems:
                                  "center",
                                gap: "8px",
                                fontSize: "12px",
                                color: "#374151",
                              }}
                            >

                              Quantity

                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={
                                  quantity
                                }
                                onChange={(event) => {

                                  const value =
                                    Math.max(
                                      1,
                                      parseInt(
                                        event
                                          .target
                                          .value ||
                                          "1",
                                        10
                                      )
                                    );

                                  setProductQuantities(
                                    (previous) => ({
                                      ...previous,
                                      [product.id]:
                                        value,
                                    })
                                  );

                                }}
                                style={{
                                  width:
                                    "70px",
                                  height:
                                    "32px",
                                  padding:
                                    "0 8px",
                                  border:
                                    "1px solid #d1d5db",
                                  borderRadius:
                                    "5px",
                                  boxSizing:
                                    "border-box",
                                }}
                              />

                            </label>

                          </div>
                        )}

                      </div>

                    </div>
                  );
                }
              )}

            </div>
          )}

        </div>
      )}


      {/* =================================================
          PRINT BUTTON
          ================================================= */}

      <button
        type="button"
        className="primary-btn"
        disabled={
          printableProducts.length ===
          0
        }
        onClick={
          handlePrint
        }
      >
        Print QR Labels (
        {
          printableProducts.length
        }
        )
      </button>


      {/* =================================================
          SCREEN PREVIEW
          ================================================= */}

      {printableProducts.length > 0 && (

        <div
          className={
            `print-area ${
              printLayout ===
              "THERMAL_47_5X25"
                ? "thermal-47-5-25"
                : "thermal-32-5-18"
            }`
          }
          ref={pdfRef}
        >

          {printableProducts.map(
            (
              product,
              index
            ) => (

              <BarcodeLabel
                key={
                  `${product.id}-${index}`
                }
                product={product}
                subcollectionName={
                  selectedSubcollectionName
                }
              />

            )
          )}

        </div>

      )}

    </div>
  );
};

export default BarcodePrintingPage;