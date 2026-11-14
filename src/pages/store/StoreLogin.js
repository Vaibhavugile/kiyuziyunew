
import React, { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useStoreAuth } from "./StoreAuthContext";
import "./StoreAuth.css";

const StoreLogin = () => {

  const { login } = useStoreAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = location.state?.redirectTo || "/";

  const handleSubmit = async (e) => {

    e.preventDefault();

    setError("");
    setSubmitting(true);

    try {

      await login(email, password);

      if (window.fbq) {
        window.fbq("track", "Login");
      }

      navigate(redirectTo);

    } catch (err) {

      if (err.message === "STORE_ACCOUNT_INACTIVE") {

        window.alert(
          "Your store account is currently inactive.\n\nPlease contact our technical team for assistance."
        );

      } else if (err.message === "STORE_CUSTOMER_NOT_REGISTERED") {

        setError("You are not registered in this store.");

      } else {

        setError(err.message || "Unable to login. Please try again.");

      }

    } finally {

      setSubmitting(false);

    }

  };

  return (

    <div className="auth-container">

      <form onSubmit={handleSubmit}>

        <h2>Login</h2>

        {error && (
          <p className="auth-error">
            {error}
          </p>
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <button type="submit" disabled={submitting}>
          {submitting ? "Please wait..." : "Login"}
        </button>

        <p>
          Don't have an account? <Link to="/store/signup">Signup</Link>
        </p>

      </form>

    </div>

  );

};

export default StoreLogin;
