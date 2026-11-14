
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc
} from "firebase/firestore";

import { db } from "../firebase";
import "./DropshipperManagement.css";

const DropshipperManagement = () => {
  const [dropshippers, setDropshippers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");

  // Real-time dropshipper list
  useEffect(() => {
    const dropshipperQuery = query(
      collection(db, "users"),
      where("role", "==", "dropshipper")
    );

    const unsubscribe = onSnapshot(
      dropshipperQuery,
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data()
        }));

        data.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || a.createdAt || 0;
          const bTime = b.createdAt?.toMillis?.() || b.createdAt || 0;
          return bTime - aTime;
        });

        setDropshippers(data);
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error("Dropshipper loading error:", err);
        setError("Unable to load dropshippers. Please try again.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Missing active field means active
  const isActive = (seller) => seller.active !== false;

  const activeCount = dropshippers.filter(isActive).length;
  const inactiveCount = dropshippers.length - activeCount;

  // Search and filter
  const filteredDropshippers = useMemo(() => {
    return dropshippers.filter((seller) => {
      const searchText = search.toLowerCase();

      const matchesSearch =
        (seller.name || "").toLowerCase().includes(searchText) ||
        (seller.email || "").toLowerCase().includes(searchText) ||
        (seller.phone || "").toLowerCase().includes(searchText) ||
        (seller.storeName || "").toLowerCase().includes(searchText) ||
        (seller.storeSlug || "").toLowerCase().includes(searchText);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && isActive(seller)) ||
        (statusFilter === "inactive" && !isActive(seller));

      return matchesSearch && matchesStatus;
    });
  }, [dropshippers, search, statusFilter]);

  // Activate / deactivate
  const handleToggleStatus = async (seller) => {
    const currentlyActive = isActive(seller);
    const nextStatus = !currentlyActive;

    if (
      currentlyActive &&
      !window.confirm(
        `Are you sure you want to deactivate ${seller.name || seller.email}?`
      )
    ) {
      return;
    }

    try {
      setUpdatingId(seller.id);
      setError("");

      await updateDoc(doc(db, "users", seller.id), {
        active: nextStatus,
        statusUpdatedAt: Date.now()
      });

    } catch (err) {
      console.error("Status update error:", err);
      setError("Could not update this dropshipper's status.");
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDate = (value) => {
    if (!value) return "—";

    try {
      const date = value?.toDate
        ? value.toDate()
        : new Date(value);

      if (Number.isNaN(date.getTime())) return "—";

      return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
    } catch {
      return "—";
    }
  };

  return (
    <div className="drop-management">

      <div className="drop-management-header">
        <div>
          <span className="drop-eyebrow">ADMINISTRATION</span>
          <h1>Dropshipper Management</h1>
          <p>Manage your dropshippers and control their account access.</p>
        </div>

        <div className="drop-total">
          <span>Total dropshippers</span>
          <strong>{dropshippers.length}</strong>
        </div>
      </div>

      {/* Statistics */}
      <div className="drop-stats">

        <div className="drop-stat-card">
          <div className="drop-stat-icon total">♙</div>
          <div>
            <span>Total accounts</span>
            <strong>{dropshippers.length}</strong>
          </div>
        </div>

        <div className="drop-stat-card">
          <div className="drop-stat-icon active">✓</div>
          <div>
            <span>Active accounts</span>
            <strong>{activeCount}</strong>
          </div>
        </div>

        <div className="drop-stat-card">
          <div className="drop-stat-icon inactive">⊘</div>
          <div>
            <span>Inactive accounts</span>
            <strong>{inactiveCount}</strong>
          </div>
        </div>

      </div>

      {/* Toolbar */}
      <div className="drop-toolbar">

        <div className="drop-search">
          <span>⌕</span>
          <input
            type="text"
            placeholder="Search name, email, phone or store..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All accounts</option>
          <option value="active">Active only</option>
          <option value="inactive">Inactive only</option>
        </select>

      </div>

      {error && (
        <div className="drop-error">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="drop-table-container">

        {loading ? (
          <div className="drop-loading">
            <div className="drop-spinner"></div>
            <p>Loading dropshippers...</p>
          </div>
        ) : filteredDropshippers.length === 0 ? (
          <div className="drop-empty">
            <div>♙</div>
            <h3>No dropshippers found</h3>
            <p>Try changing your search or status filter.</p>
          </div>
        ) : (

          <div className="drop-table-scroll">
            <table className="drop-table">

              <thead>
                <tr>
                  <th>DROPSHIPPER</th>
                  <th>STORE</th>
                  <th>CONTACT</th>
                  <th>JOINED</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>

              <tbody>
                {filteredDropshippers.map((seller) => {
                  const active = isActive(seller);
                  const updating = updatingId === seller.id;

                  return (
                    <tr key={seller.id}>

                      <td>
                        <div className="drop-person">
                          <div className="drop-avatar">
                            {(seller.name || seller.email || "D")
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div>
                            <strong>{seller.name || "Unnamed dropshipper"}</strong>
                            <small>{seller.email || "No email"}</small>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="drop-store">
                          <strong>{seller.storeName || "—"}</strong>
                          <small>{seller.storeSlug || seller.storeDomain || ""}</small>
                        </div>
                      </td>

                      <td>{seller.phone || "—"}</td>

                      <td>{formatDate(seller.createdAt)}</td>

                      <td>
                        <span className={`drop-status ${active ? "is-active" : "is-inactive"}`}>
                          <span className="drop-status-dot"></span>
                          {active ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td>
                        <button
                          type="button"
                          className={`drop-toggle-btn ${active ? "deactivate" : "activate"}`}
                          disabled={updating}
                          onClick={() => handleToggleStatus(seller)}
                        >
                          {updating
                            ? "Updating..."
                            : active
                              ? "Deactivate"
                              : "Activate"}
                        </button>
                      </td>

                    </tr>
                  );
                })}
              </tbody>

            </table>
          </div>
        )}

      </div>

      <div className="drop-footer">
        Showing {filteredDropshippers.length} of {dropshippers.length} dropshippers
      </div>

    </div>
  );
};

export default DropshipperManagement;
