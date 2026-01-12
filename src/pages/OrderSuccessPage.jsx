import React from 'react';
import { Link } from 'react-router-dom';
import './OrderSuccessPage.css';

const OrderSuccessPage = () => {
  return (
    <div className="order-success-container">
      <h2>Order Placed Successfully!</h2>
      <p>Thank you for your purchase. Your order has been submitted and is being processed.</p>
      <Link to="/" className="continue-shopping-btn">Continue Shopping</Link>
    </div>
  );
};

export default OrderSuccessPage;