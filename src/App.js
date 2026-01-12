import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import HomePage from './pages/HomePage';
import AdminPage from './pages/AdminPage';
import LoginPage from './pages/LoginPage';
import SubcollectionsPage from './pages/SubcollectionsPage';
import ProductsPage from './pages/ProductsPage';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import { CartProvider } from './components/CartContext';
import { AuthProvider } from './components/AuthContext';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import OrderSuccessPage from './pages/OrderSuccessPage';
import OrderHistoryPage from './pages/OrderHistoryPage'; // Import the new page
import ReportPage from './pages/ReportPage';
import TermsAndPolicies from './pages/TermsAndPolicies';
function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <Router>
          <Navbar />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/Apple@782k" element={<AdminPage />} />
            <Route path="/collections/:collectionId" element={<SubcollectionsPage />} />
            <Route path="/collections/:collectionId/all-products" element={<ProductsPage />} />            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/order-success" element={<OrderSuccessPage />} />
            <Route path="/order-history" element={<OrderHistoryPage />} /> {/* Add the new route here */}
            <Route path="/report" element={<ReportPage />} />
            <Route path="/terms" element={<TermsAndPolicies />} />
          </Routes> 
          <Footer />
        </Router>
      </CartProvider>
    </AuthProvider>
  );
}

export default App;