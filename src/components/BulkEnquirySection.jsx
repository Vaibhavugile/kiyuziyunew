import React, { useState } from "react";
import "./BulkEnquirySection.css";

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
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setForm((prev) => ({
      ...prev,
      image: file,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!form.name || !form.phone) {
      alert("Please enter name and contact number");
      return;
    }

    if (Number(form.quantity) < MIN_QTY) {
      alert(`Minimum bulk order quantity is ${MIN_QTY}`);
      return;
    }

    // 🔥 Later: send to Firestore / WhatsApp
    console.log("Bulk Enquiry Submitted:", form);

    alert("Your bulk enquiry has been submitted. Our team will contact you shortly.");

    setForm({
      name: "",
      phone: "",
      productName: "",
      productCode: "",
      quantity: "",
      message: "",
      image: null,
    });
  };

  return (
    <section className="bulk-enquiry-section">
      {/* HEADER */}
      <div className="bulk-enquiry-header">
        <h2>Bulk Order Enquiry</h2>
        <p>
          Looking to place a bulk order for a single product?  
          Share your requirements and our wholesale team will assist you.
        </p>

        <div className="bulk-badges">
          <span>Wholesale Pricing</span>
          <span>Direct Manufacturer</span>
          <span>Fast Response</span>
          <span>MOQ {MIN_QTY}+</span>
        </div>
      </div>

      {/* FORM */}
      <form className="bulk-enquiry-form" onSubmit={handleSubmit}>
        <div className="bulk-form-grid">
          {/* NAME */}
          <div className="bulk-form-group">
            <label>Your Name</label>
            <input
              type="text"
              name="name"
              placeholder="Enter your full name"
              value={form.name}
              onChange={handleChange}
              required
            />
          </div>

          {/* PHONE */}
          <div className="bulk-form-group">
            <label>Contact Number</label>
            <input
              type="tel"
              name="phone"
              placeholder="WhatsApp / Mobile number"
              value={form.phone}
              onChange={handleChange}
              required
            />
          </div>

          {/* PRODUCT NAME */}
          <div className="bulk-form-group">
            <label>Product Name</label>
            <input
              type="text"
              name="productName"
              placeholder="Product name (if known)"
              value={form.productName}
              onChange={handleChange}
            />
          </div>

          {/* PRODUCT CODE */}
          <div className="bulk-form-group">
            <label>Product Code</label>
            <input
              type="text"
              name="productCode"
              placeholder="Product code / SKU"
              value={form.productCode}
              onChange={handleChange}
            />
          </div>

          {/* QUANTITY */}
          <div className="bulk-form-group">
            <label>Required Quantity</label>
            <input
              type="number"
              name="quantity"
              placeholder="Enter quantity"
              value={form.quantity}
              onChange={handleChange}
              required
            />
            <span className="bulk-quantity-note">
              Minimum bulk order: {MIN_QTY} units
            </span>
          </div>

          {/* IMAGE UPLOAD */}
          <div className="bulk-form-group">
            <label>Product Image (optional)</label>
            <label className="bulk-file-upload">
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={handleImageChange}
              />
              <span>
                {form.image ? form.image.name : "Click to upload product image"}
              </span>
            </label>
          </div>

          {/* MESSAGE */}
          <div className="bulk-form-group full">
            <label>Additional Details</label>
            <textarea
              name="message"
              rows="4"
              placeholder="Any specific requirements, customization, delivery timeline, etc."
              value={form.message}
              onChange={handleChange}
            />
          </div>
        </div>

        {/* SUBMIT */}
        <div className="bulk-submit">
          <button type="submit">Submit Bulk Enquiry</button>
        </div>

        <div className="bulk-trust">
          🔒 Your information is secure. Our team usually responds within 24 hours.
        </div>
      </form>
    </section>
  );
};

export default BulkEnquirySection;
