import React from "react";
import CollectionCard from "../../components/CollectionCard";
import "../../components/CollectionCard.css";

const CollectionsSection = ({ data }) => {
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
              console.log("Go to collection:", col.id);

              // 👉 later: navigate(`/collection/${col.id}`)
            }}
          />
        ))}
      </div>
    </section>
  );
};

export default CollectionsSection;