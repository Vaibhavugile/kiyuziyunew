import React from "react";
import CollectionCard from "../../components/CollectionCard";
import "../../components/CollectionCard.css";
import { useNavigate } from "react-router-dom";
import { getCleanDomain } from "../../utils/domain";

const CollectionsSection = ({ data }) => {
    const navigate = useNavigate();
  if (!data?.collections?.length) return null;


  return (
    <section style={{ padding: "40px 20px" }}>
      
      {data.title && (
        <h2 style={{ marginBottom: "20px" }}>
          {data.title}
        </h2>
      )}

      <div className="collection-grid">
        {data.collections.map((col) => (
          <CollectionCard
            key={col.id}
            id={col.id}
            title={col.title}
            image={col.image}
            additionalImages={col.additionalImages}
            onClick={() => {
  navigate("/store", {
    state: {
      collectionId: col.id,
      storeDomain: getCleanDomain()
    }
  });
}}
          />
        ))}
      </div>
    </section>
  );
};

export default CollectionsSection;