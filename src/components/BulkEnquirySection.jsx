import React, { useState } from "react";
import "./BulkEnquirySection.css";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../firebase";

const MIN_QTY = 200;

const BulkEnquirySection = () => {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    productName: "",
    productCode: "",
    quantity: "",
    message: "",
    image: null,
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const uploadImage = async (file) => {
  if (!file) return null;

  const fileName = `${Date.now()}_${file.name}`;
  const storageRef = ref(storage, `bulk-enquiries/${fileName}`);

  await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(storageRef);

  return {
    name: fileName,
    url: downloadURL,
  };
};

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setForm((prev) => ({ ...prev, image: file }));
  };

 const handleSubmit = async (e) => {
  e.preventDefault();

  try {
    let imageData = null;

    // 🔥 Upload image if selected
    if (form.image) {
      imageData = await uploadImage(form.image);
    }

    await addDoc(collection(db, "bulkEnquiries"), {
      name: form.name || "",
      phone: form.phone || "",
      productName: form.productName || "",
      productCode: form.productCode || "",
      quantity: form.quantity ? Number(form.quantity) : null,
      message: form.message || "",

      imageName: imageData?.name || "",
      imageURL: imageData?.url || "",

      source: "website",
      status: "new",
      createdAt: serverTimestamp(),
    });

    alert("Thank you! Our wholesale team will contact you shortly.");

    setForm({
      name: "",
      phone: "",
      productName: "",
      productCode: "",
      quantity: "",
      message: "",
      image: null,
    });
  } catch (error) {
    console.error("Bulk enquiry save failed:", error);
    alert("Something went wrong. Please try again.");
  }
};


  return (
    <section className="bulk-enquiry-section">
      <div className="bulk-enquiry-header">
        <h2>Bulk Order Enquiry</h2>
        <p>
          Looking to place a bulk order? Share your requirements and our team
          will assist you.
        </p>

        <div className="bulk-badges">
          <span>Wholesale Pricing</span>
          <span>Direct Manufacturer</span>
          <span>Fast Response</span>
          <span>MOQ {MIN_QTY}+</span>
        </div>
      </div>

      <form className="bulk-enquiry-form" onSubmit={handleSubmit}>
        <div className="bulk-form-grid">
          <div className="bulk-form-group">
            <label>Your Name</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Your name (optional)"
            />
          </div>

          <div className="bulk-form-group">
            <label>Contact Number</label>
            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="WhatsApp / Phone (optional)"
            />
          </div>

          <div className="bulk-form-group">
            <label>Product Name</label>
            <input
              name="productName"
              value={form.productName}
              onChange={handleChange}
              placeholder="Product name (optional)"
            />
          </div>

          <div className="bulk-form-group">
            <label>Product Code</label>
            <input
              name="productCode"
              value={form.productCode}
              onChange={handleChange}
              placeholder="SKU / Model (optional)"
            />
          </div>

          <div className="bulk-form-group">
            <label>Required Quantity</label>
            <input
              type="number"
              name="quantity"
              value={form.quantity}
              onChange={handleChange}
              placeholder={`Minimum ${MIN_QTY}+ (optional)`}
            />
          </div>

          <div className="bulk-form-group">
            <label>Product Image</label>
            <label className="bulk-file-upload">
              <input type="file" hidden accept="image/*" onChange={handleImageChange} />
              <span>
                {form.image ? form.image.name : "Upload image (optional)"}
              </span>
            </label>
          </div>

          <div className="bulk-form-group full">
            <label>Additional Details</label>
            <textarea
              name="message"
              rows="4"
              value={form.message}
              onChange={handleChange}
              placeholder="Any extra details (optional)"
            />
          </div>
        </div>

        <div className="bulk-submit">
          <button type="submit">Submit Bulk Enquiry</button>
        </div>

        <div className="bulk-trust">
          🔒 Your details are secure. We usually respond within 24 hours.
        </div>
      </form>
    </section>
  );
};

export default BulkEnquirySection;
