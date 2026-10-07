import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  db,
} from "../firebase";
import { Timestamp } from "firebase/firestore";
import "./AdminDailyOrders.css";

const DEFAULT_CHECKS = [
  "Order Confirmed",
  "Payment Verified",
  "Packed",
  "Dispatched",
];

const CHECKLIST_SETTINGS_DOC = "dailyOrderChecklist";

const getLocalDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const getDateObject = (timestamp) => {
  if (!timestamp) return null;

  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate();
  }

  if (timestamp instanceof Date) {
    return timestamp;
  }

  if (typeof timestamp === "object" && timestamp.seconds != null) {
    return new Date(Number(timestamp.seconds) * 1000);
  }

  const date = new Date(timestamp);

  return Number.isNaN(date.getTime()) ? null : date;
};

const getDateRange = (dateKey) => {
  const [year, month, day] = dateKey.split("-").map(Number);

  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);

  return {
    startTimestamp: Timestamp.fromDate(start),
    endTimestamp: Timestamp.fromDate(end),
  };
};

const formatDisplayDate = (dateString) => {
  if (!dateString) return "";

  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const AdminDailyOrders = () => {
  const [orders, setOrders] = useState([]);
  const [storeOrders, setStoreOrders] = useState([]);
  const [sellers, setSellers] = useState({});

  // Local date is used so "today" does not shift because of UTC conversion.
  const [selectedDate, setSelectedDate] = useState(getLocalDateKey());

  const [checkLabels, setCheckLabels] = useState(DEFAULT_CHECKS);
  const [checkValues, setCheckValues] = useState({});

  const [loading, setLoading] = useState(true);
  const [savingCheck, setSavingCheck] = useState(null);

  const [showChecklistSettings, setShowChecklistSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  /*
   * ------------------------------------------------------------
   * LOAD CHECKLIST SETTINGS
   * This is only one small settings document, not order data.
   * ------------------------------------------------------------
   */
  useEffect(() => {
    const loadChecklistSettings = async () => {
      try {
        const settingsRef = doc(
          db,
          "settings",
          CHECKLIST_SETTINGS_DOC
        );

        const snapshot = await getDoc(settingsRef);

        if (snapshot.exists()) {
          const data = snapshot.data();

          if (
            Array.isArray(data.checkLabels) &&
            data.checkLabels.length === 4
          ) {
            setCheckLabels(data.checkLabels);
          }
        }
      } catch (error) {
        console.error("Failed to load checklist settings:", error);
      }
    };

    loadChecklistSettings();
  }, []);

  /*
   * ------------------------------------------------------------
   * LOAD ONLY THE SELECTED DAY
   *
   * IMPORTANT:
   * We do NOT do:
   *   getDocs(collection(db, "orders"))
   *   getDocs(collection(db, "storeOrders"))
   *
   * Instead Firestore receives a createdAt date range.
   * ------------------------------------------------------------
   */
  useEffect(() => {
    let active = true;

    const loadDataForDate = async () => {
      setLoading(true);
      setOrders([]);
      setStoreOrders([]);
      setCheckValues({});

      try {
        const { startTimestamp, endTimestamp } =
          getDateRange(selectedDate);

        const ordersQuery = query(
          collection(db, "orders"),
          where("createdAt", ">=", startTimestamp),
          where("createdAt", "<", endTimestamp)
        );

        const storeOrdersQuery = query(
          collection(db, "storeOrders"),
          where("createdAt", ">=", startTimestamp),
          where("createdAt", "<", endTimestamp)
        );

        // Both date-range queries can run together.
        const [ordersSnapshot, storeOrdersSnapshot] =
          await Promise.all([
            getDocs(ordersQuery),
            getDocs(storeOrdersQuery),
          ]);

        if (!active) return;

        const ordersList = ordersSnapshot.docs
          .map((orderDoc) => ({
            id: orderDoc.id,
            ...orderDoc.data(),
            orderType: "order",
          }))
          .filter(
            (order) =>
              String(order.status || "").toLowerCase() !==
              "cancelled"
          )
          .sort((a, b) => {
            const dateA =
              getDateObject(a.createdAt)?.getTime() || 0;
            const dateB =
              getDateObject(b.createdAt)?.getTime() || 0;

            return dateB - dateA;
          });

        const storeOrdersList = storeOrdersSnapshot.docs
          .map((orderDoc) => ({
            id: orderDoc.id,
            ...orderDoc.data(),
            orderType: "storeOrder",
          }))
          .filter(
            (order) =>
              String(order.status || "").toLowerCase() !==
              "cancelled"
          )
          .sort((a, b) => {
            const dateA =
              getDateObject(a.createdAt)?.getTime() || 0;
            const dateB =
              getDateObject(b.createdAt)?.getTime() || 0;

            return dateB - dateA;
          });

        setOrders(ordersList);
        setStoreOrders(storeOrdersList);

        /*
         * Only fetch sellers actually used by today's store orders.
         * Previously the page loaded the complete users collection.
         */
        await loadRequiredSellers(storeOrdersList);

        if (!active) return;

        /*
         * Checklist reads are limited to the orders already returned
         * for the selected day.
         */
        await loadChecklistStates(
          ordersList,
          storeOrdersList,
          selectedDate,
          active
        );
      } catch (error) {
        console.error(
          "Failed to load daily orders:",
          error
        );

        if (active) {
          setOrders([]);
          setStoreOrders([]);
          setCheckValues({});
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadDataForDate();

    return () => {
      active = false;
    };
  }, [selectedDate]);

  /*
   * ------------------------------------------------------------
   * LOAD ONLY REQUIRED SELLERS
   * ------------------------------------------------------------
   */
  const loadRequiredSellers = async (storeOrderList) => {
    const sellerIds = [
      ...new Set(
        storeOrderList
          .map((order) => order.sellerId)
          .filter(Boolean)
      ),
    ];

    if (sellerIds.length === 0) {
      return;
    }

    const missingSellerIds = sellerIds.filter(
      (sellerId) => !sellers[sellerId]
    );

    if (missingSellerIds.length === 0) {
      return;
    }

    try {
      const sellerResults = await Promise.all(
        missingSellerIds.map(async (sellerId) => {
          try {
            const sellerRef = doc(db, "users", sellerId);
            const sellerSnapshot = await getDoc(sellerRef);

            if (!sellerSnapshot.exists()) {
              return [
                sellerId,
                {
                  id: sellerId,
                  storeName: "Unknown Seller",
                },
              ];
            }

            return [
              sellerId,
              {
                id: sellerSnapshot.id,
                ...sellerSnapshot.data(),
              },
            ];
          } catch (error) {
            console.error(
              `Failed to load seller ${sellerId}:`,
              error
            );

            return [
              sellerId,
              {
                id: sellerId,
                storeName: "Unknown Seller",
              },
            ];
          }
        })
      );

      setSellers((previous) => ({
        ...previous,
        ...Object.fromEntries(sellerResults),
      }));
    } catch (error) {
      console.error("Failed to load required sellers:", error);
    }
  };

  /*
   * ------------------------------------------------------------
   * LOAD CHECKBOX STATES
   *
   * Only today's already-filtered orders are checked.
   * Historical orders are never touched.
   * ------------------------------------------------------------
   */
  const loadChecklistStates = async (
    normalOrders,
    storeOrderList,
    dateKey,
    isActive
  ) => {
    try {
      const allOrders = [
        ...normalOrders,
        ...storeOrderList,
      ];

      if (allOrders.length === 0) {
        if (isActive) {
          setCheckValues({});
        }
        return;
      }

      const states = {};

      await Promise.all(
        allOrders.map(async (order) => {
          const docId = `${dateKey}_${order.orderType}_${order.id}`;

          const checkRef = doc(
            db,
            "dailyOrderChecks",
            docId
          );

          try {
            const checkSnapshot = await getDoc(checkRef);

            states[docId] = checkSnapshot.exists()
              ? checkSnapshot.data().checks || {}
              : {};
          } catch (error) {
            console.error(
              `Failed to load checklist for ${docId}:`,
              error
            );

            states[docId] = {};
          }
        })
      );

      if (isActive) {
        setCheckValues(states);
      }
    } catch (error) {
      console.error(
        "Failed to load checklist states:",
        error
      );
    }
  };

  /*
   * ------------------------------------------------------------
   * CHECKBOX HANDLER
   * ------------------------------------------------------------
   */
  const handleCheckChange = async (
    order,
    checkIndex,
    checked
  ) => {
    const docId = `${selectedDate}_${order.orderType}_${order.id}`;

    const previousChecks = checkValues[docId] || {};

    const updatedChecks = {
      ...previousChecks,
      [`check${checkIndex + 1}`]: checked,
    };

    // Update UI immediately.
    setCheckValues((previous) => ({
      ...previous,
      [docId]: updatedChecks,
    }));

    const savingKey = `${docId}_${checkIndex}`;

    setSavingCheck(savingKey);

    try {
      const checkRef = doc(
        db,
        "dailyOrderChecks",
        docId
      );

      await setDoc(
        checkRef,
        {
          date: selectedDate,
          orderId: order.id,
          orderType: order.orderType,
          checks: updatedChecks,
          updatedAt: Date.now(),
        },
        {
          merge: true,
        }
      );
    } catch (error) {
      console.error(
        "Failed to save checklist:",
        error
      );

      // Revert the UI if saving failed.
      setCheckValues((previous) => ({
        ...previous,
        [docId]: previousChecks,
      }));
    } finally {
      setSavingCheck(null);
    }
  };

  /*
   * ------------------------------------------------------------
   * CHECKLIST SETTINGS
   * ------------------------------------------------------------
   */
  const handleCheckLabelChange = (index, value) => {
    setCheckLabels((previous) => {
      const updated = [...previous];
      updated[index] = value;
      return updated;
    });
  };

  const saveChecklistSettings = async () => {
    setSavingSettings(true);

    try {
      const cleanedLabels = checkLabels.map(
        (label, index) =>
          String(label || "").trim() ||
          `Check ${index + 1}`
      );

      await setDoc(
        doc(
          db,
          "settings",
          CHECKLIST_SETTINGS_DOC
        ),
        {
          checkLabels: cleanedLabels,
          updatedAt: Date.now(),
        },
        {
          merge: true,
        }
      );

      setCheckLabels(cleanedLabels);
      setShowChecklistSettings(false);
    } catch (error) {
      console.error(
        "Failed to save checklist settings:",
        error
      );
    } finally {
      setSavingSettings(false);
    }
  };

  /*
   * ------------------------------------------------------------
   * DATE NAVIGATION
   * ------------------------------------------------------------
   */
  const changeDate = (days) => {
    const [year, month, day] =
      selectedDate.split("-").map(Number);

    const date = new Date(
      year,
      month - 1,
      day
    );

    date.setDate(date.getDate() + days);

    setSelectedDate(getLocalDateKey(date));
  };

  const goToToday = () => {
    setSelectedDate(getLocalDateKey());
  };

  /*
   * ------------------------------------------------------------
   * DATA IS ALREADY DATE-FILTERED BY FIRESTORE.
   *
   * These useMemo calls only remove cancelled orders as a final
   * safety check and sort the small result set.
   * ------------------------------------------------------------
   */
  const filteredOrders = useMemo(() => {
    return orders
      .filter(
        (order) =>
          String(order.status || "").toLowerCase() !==
          "cancelled"
      )
      .sort((a, b) => {
        const dateA =
          getDateObject(a.createdAt)?.getTime() || 0;
        const dateB =
          getDateObject(b.createdAt)?.getTime() || 0;

        return dateB - dateA;
      });
  }, [orders]);

  const filteredStoreOrders = useMemo(() => {
    return storeOrders
      .filter(
        (order) =>
          String(order.status || "").toLowerCase() !==
          "cancelled"
      )
      .sort((a, b) => {
        const dateA =
          getDateObject(a.createdAt)?.getTime() || 0;
        const dateB =
          getDateObject(b.createdAt)?.getTime() || 0;

        return dateB - dateA;
      });
  }, [storeOrders]);

  /*
   * ------------------------------------------------------------
   * TOTALS
   * ------------------------------------------------------------
   */
  const normalOrderTotal = filteredOrders.reduce(
    (sum, order) =>
      sum + Number(order.totalAmount || 0),
    0
  );

  const storeOrderTotal =
    filteredStoreOrders.reduce(
      (sum, order) =>
        sum + Number(order.totalAmount || 0),
      0
    );

  const totalOrderValue =
    normalOrderTotal + storeOrderTotal;

  /*
   * ------------------------------------------------------------
   * CHECK STATUS
   * ------------------------------------------------------------
   */
  const getCheckStatus = (order) => {
    const docId = `${selectedDate}_${order.orderType}_${order.id}`;

    return checkValues[docId] || {};
  };

  const renderChecks = (order) => {
    const checks = getCheckStatus(order);

    return checkLabels.map((label, index) => {
      const checkKey = `check${index + 1}`;

      const savingKey =
        `${selectedDate}_${order.orderType}_${order.id}_${index}`;

      return (
        <td
          key={checkKey}
          className="daily-check-cell"
        >
          <label
            className="daily-checkbox"
            title={label}
          >
            <input
              type="checkbox"
              checked={checks[checkKey] === true}
              disabled={savingCheck === savingKey}
              onChange={(event) =>
                handleCheckChange(
                  order,
                  index,
                  event.target.checked
                )
              }
            />

            <span className="checkmark"></span>
          </label>
        </td>
      );
    });
  };

  /*
   * ------------------------------------------------------------
   * ORDER ROW
   * ------------------------------------------------------------
   */
  const renderOrderRow = (order) => {
    const seller = sellers[order.sellerId];

    const sellerName =
      seller?.storeName ||
      seller?.name ||
      seller?.displayName ||
      "Unknown Seller";

    const customerName =
      order.billingInfo?.fullName ||
      order.customerName ||
      order.userName ||
      "Unknown Customer";

    const orderValue = Number(
      order.totalAmount || 0
    ).toLocaleString("en-IN");

    const statusClass = String(
      order.status || "pending"
    )
      .toLowerCase()
      .replace(/\s+/g, "-");

    return (
      <tr
        key={`${order.orderType}-${order.id}`}
      >
        <td>
          <div className="customer-name">
            {customerName}
          </div>

          <div className="order-id-small">
            #{order.id.slice(0, 8)}
          </div>
        </td>

        <td className="amount-cell">
          ₹{orderValue}
        </td>

        <td>
          <span
            className={`daily-status status-${statusClass}`}
          >
            {order.status || "Pending"}
          </span>
        </td>

        {order.orderType === "storeOrder" && (
          <>
            <td>
              <span className="store-badge">
                Store
              </span>
            </td>

            <td>
              <strong>{sellerName}</strong>
            </td>
          </>
        )}

        {order.orderType === "order" && (
          <>
            <td className="empty-seller">—</td>
            <td className="empty-seller">—</td>
          </>
        )}

        {renderChecks(order)}
      </tr>
    );
  };

  /*
   * ------------------------------------------------------------
   * LOADING
   * ------------------------------------------------------------
   */
  if (loading) {
    return (
      <div className="daily-orders-loading">
        <div className="loading-spinner"></div>
        <p>
          Loading orders for {formatDisplayDate(selectedDate)}...
        </p>
      </div>
    );
  }

  /*
   * ------------------------------------------------------------
   * UI
   * ------------------------------------------------------------
   */
  return (
    <div className="daily-orders-page print-container">
      {/* PRINT HEADER */}
      <div className="daily-print-header">
        <div className="daily-print-header-left">
          <div className="daily-print-eyebrow">DAILY OPERATIONS</div>
          <h1>Daily Orders Report</h1>
          <p>{formatDisplayDate(selectedDate)}</p>
        </div>

        <div className="daily-print-header-right">
          <div>
            <span>Orders</span>
            <strong>{filteredOrders.length}</strong>
          </div>
          <div>
            <span>Store Orders</span>
            <strong>{filteredStoreOrders.length}</strong>
          </div>
          <div>
            <span>Total Orders</span>
            <strong>
              {filteredOrders.length + filteredStoreOrders.length}
            </strong>
          </div>
          <div>
            <span>Total Value</span>
            <strong>
              ₹{totalOrderValue.toLocaleString("en-IN")}
            </strong>
          </div>
        </div>
      </div>
      {/* HEADER */}
      <div className="daily-orders-header">
        <div>
          <div className="page-eyebrow">
            DAILY OPERATIONS
          </div>

          <h1>Daily Orders</h1>

          <p>
            Review and complete the order checklist
            for the selected date.
          </p>
        </div>

        <div className="daily-header-actions">
          <button
            className="btn-secondary"
            onClick={() =>
              setShowChecklistSettings(
                !showChecklistSettings
              )
            }
          >
            ⚙ Checklist Settings
          </button>

          <button
            className="btn-print"
            onClick={() => window.print()}
          >
            🖨 Print
          </button>
        </div>
      </div>

      {/* DATE CONTROL */}
      <div className="daily-control-card">
        <div className="date-navigation">
          <button
            className="date-nav-btn"
            onClick={() => changeDate(-1)}
            aria-label="Previous day"
          >
            ←
          </button>

          <div className="selected-date-wrapper">
            <span className="date-label">
              ORDER DATE
            </span>

            <input
              type="date"
              value={selectedDate}
              onChange={(event) =>
                setSelectedDate(event.target.value)
              }
              className="daily-date-input"
              aria-label="Select order date"
            />

            <strong>
              {formatDisplayDate(selectedDate)}
            </strong>
          </div>

          <button
            className="date-nav-btn"
            onClick={() => changeDate(1)}
            aria-label="Next day"
          >
            →
          </button>
        </div>

        <button
          className="today-btn"
          onClick={goToToday}
        >
          Today
        </button>
      </div>

      {/* CHECKLIST SETTINGS */}
      {showChecklistSettings && (
        <div className="checklist-settings">
          <div className="settings-title">
            Daily Checklist
          </div>

          <p className="settings-description">
            Set the four checks you want to complete
            for every order.
          </p>

          <div className="check-settings-grid">
            {checkLabels.map((label, index) => (
              <div
                className="setting-field"
                key={index}
              >
                <label>
                  Check {index + 1}
                </label>

                <input
                  type="text"
                  value={label}
                  maxLength={40}
                  onChange={(event) =>
                    handleCheckLabelChange(
                      index,
                      event.target.value
                    )
                  }
                />
              </div>
            ))}
          </div>

          <div className="settings-actions">
            <button
              className="btn-secondary"
              onClick={() =>
                setShowChecklistSettings(false)
              }
            >
              Cancel
            </button>

            <button
              className="btn-save"
              disabled={savingSettings}
              onClick={saveChecklistSettings}
            >
              {savingSettings
                ? "Saving..."
                : "Save Checklist"}
            </button>
          </div>
        </div>
      )}

      {/* SUMMARY */}
      <div className="daily-summary">
        <div className="summary-card">
          <span>Normal Orders</span>
          <strong>{filteredOrders.length}</strong>
        </div>

        <div className="summary-card">
          <span>Store Orders</span>
          <strong>
            {filteredStoreOrders.length}
          </strong>
        </div>

        <div className="summary-card">
          <span>Total Orders</span>
          <strong>
            {filteredOrders.length +
              filteredStoreOrders.length}
          </strong>
        </div>

        <div className="summary-card total-value-card">
          <span>Total Order Value</span>
          <strong>
            ₹
            {totalOrderValue.toLocaleString(
              "en-IN"
            )}
          </strong>
        </div>
      </div>

      {/* NORMAL ORDERS */}
      <section className="daily-section">
        <div className="section-heading">
          <div>
            <span className="section-number">
              01
            </span>

            <div>
              <h2>Orders</h2>

              <p>
                Direct customer orders
              </p>
            </div>
          </div>

          <span className="section-count">
            {filteredOrders.length} orders
          </span>
        </div>

        <div className="daily-table-wrapper">
          <table className="daily-orders-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Order Value</th>
                <th>Status</th>
                <th>Seller</th>
                <th>Seller Name</th>

                {checkLabels.map(
                  (label, index) => (
                    <th key={index}>
                      {label}
                    </th>
                  )
                )}
              </tr>
            </thead>

            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      5 + checkLabels.length
                    }
                    className="empty-state"
                  >
                    No normal orders for{" "}
                    {formatDisplayDate(
                      selectedDate
                    )}
                    .
                  </td>
                </tr>
              ) : (
                filteredOrders.map(
                  renderOrderRow
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* STORE ORDERS */}
      <section className="daily-section store-orders-section">
        <div className="section-heading">
          <div>
            <span className="section-number store-number">
              02
            </span>

            <div>
              <h2>Store Orders</h2>

              <p>
                Marketplace / seller orders
              </p>
            </div>
          </div>

          <span className="section-count">
            {filteredStoreOrders.length} orders
          </span>
        </div>

        <div className="daily-table-wrapper">
          <table className="daily-orders-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Order Value</th>
                <th>Status</th>
                <th>Seller</th>
                <th>Seller Name</th>

                {checkLabels.map(
                  (label, index) => (
                    <th key={index}>
                      {label}
                    </th>
                  )
                )}
              </tr>
            </thead>

            <tbody>
              {filteredStoreOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      5 + checkLabels.length
                    }
                    className="empty-state"
                  >
                    No store orders for{" "}
                    {formatDisplayDate(
                      selectedDate
                    )}
                    .
                  </td>
                </tr>
              ) : (
                filteredStoreOrders.map(
                  renderOrderRow
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* PRINT FOOTER */}
      <div className="daily-print-footer">
        <span>Daily Orders Report</span>

        <span>
          {formatDisplayDate(selectedDate)}
        </span>
      </div>
    </div>
  );
};

export default AdminDailyOrders;
