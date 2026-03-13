import React from "react";
import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../../components/AuthContext";
import "./DropshipperLayout.css";

const DropshipperLayout = () => {

  const { currentUser } = useAuth();

  return (

    <div className="dropshipper-layout">

      <aside className="dropshipper-sidebar">

        <h2>Dropshipper Panel</h2>

        <p className="store-link">
          Store:
          <a
            href={`/store/${currentUser?.storeSlug}`}
            target="_blank"
            rel="noreferrer"
          >
            {window.location.origin}/store/{currentUser?.storeSlug}
          </a>
        </p>

        <nav>

          <Link to="/dropshipper/dashboard">
            Dashboard
          </Link>

          <Link to="/dropshipper/products">
            My Products
          </Link>

          <Link to="/dropshipper/orders">
            Orders
          </Link>

        </nav>

      </aside>

      <main className="dropshipper-content">

        <Outlet />

      </main>

    </div>

  );
};

export default DropshipperLayout;