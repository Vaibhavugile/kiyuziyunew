import React, { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import "./BulkEnquiryList.css";

const BulkEnquiryList = () => {
  const [enquiries, setEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortByQty, setSortByQty] = useState("");

  useEffect(() => {
    const fetchEnquiries = async () => {
      try {
        const q = query(
          collection(db, "bulkEnquiries"),
          orderBy("createdAt", "desc")
        );

        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setEnquiries(data);
      } catch (error) {
        console.error("Error fetching bulk enquiries:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchEnquiries();
  }, []);

  const sortedEnquiries = [...enquiries].sort((a, b) => {
    if (!sortByQty) return 0;

    const qtyA = a.quantity || 0;
    const qtyB = b.quantity || 0;

    return sortByQty === "asc" ? qtyA - qtyB : qtyB - qtyA;
  });

  if (loading) {
    return <div className="bulk-loading">Loading bulk enquiries...</div>;
  }

  return (
    <div className="bulk-table-wrapper">
      <div className="bulk-table-header">
        <h2>Bulk Enquiries</h2>

        <select
          className="bulk-sort"
          value={sortByQty}
          onChange={(e) => setSortByQty(e.target.value)}
        >
          <option value="">Sort by Quantity</option>
          <option value="asc">Quantity: Low → High</option>
          <option value="desc">Quantity: High → Low</option>
        </select>
      </div>

      <div className="bulk-table-scroll">
        <table className="bulk-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Product</th>
              <th>Code</th>
              <th>Qty</th>
              <th>Message</th>
              <th>Image</th>
              <th>Status</th>
              <th>Source</th>
            </tr>
          </thead>

          <tbody>
            {sortedEnquiries.length === 0 ? (
              <tr>
                <td colSpan="10" className="no-data">
                  No bulk enquiries found
                </td>
              </tr>
            ) : (
              sortedEnquiries.map((item, index) => (
                <tr key={item.id}>
                  <td>{index + 1}</td>
                  <td>{item.name || "—"}</td>
                  <td>{item.phone || "—"}</td>
                  <td>{item.productName || "—"}</td>
                  <td>{item.productCode || "—"}</td>
                  <td>{item.quantity || "—"}</td>
                  <td className="message-cell">{item.message || "—"}</td>
                  <td>
                    {item.imageURL ? (
                      <img
                        src={item.imageURL}
                        alt="Product"
                        className="table-image"
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span className={`status ${item.status}`}>
                      {item.status}
                    </span>
                  </td>
                  <td>{item.source}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BulkEnquiryList;
