import React from "react";
import { useAuth } from "../../components/AuthContext";

const DropshipperDashboard = () => {

  const { currentUser } = useAuth();

  return (

    <div>

      <h1>Dropshipper Dashboard</h1>

      <p>Welcome {currentUser?.name}</p>

      <h3>Your Store</h3>

      <a
        href={`/store/${currentUser?.storeSlug}`}
        target="_blank"
        rel="noreferrer"
      >
        {window.location.origin}/store/{currentUser?.storeSlug}
      </a>

    </div>

  );
};

export default DropshipperDashboard;