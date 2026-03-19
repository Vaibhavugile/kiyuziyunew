import React from "react";
import CollectionCard from "../../components/CollectionCard";
import "../../components/CollectionCard.css";

const StoreCollectionsSection = ({ data, theme }) => {

  if (!data?.items?.length) return null;

  return (
    <section
      className="collections-section"
      style={{
        background: theme?.colors?.background || "#fff"
      }}
    >

      <div className="collections-container">

        {/* 🔥 HEADER */}
        <div className="collections-header">

          <h2
            className="collections-title"
            style={{
              color: theme?.colors?.text
            }}
          >
            {data.title || "Shop Collections"}
          </h2>

          <p className="collections-subtitle">
            {data.subtitle || "Explore our curated collections"}
          </p>

        </div>

        {/* 🔥 GRID */}
        <div className="collection-grid">

          {data.items.map((col) => (
            <CollectionCard
              key={col.id}
              id={col.id}
              title={col.name}
              image={col.image}
              additionalImages={col.images || []}
              alt={col.name}
              onClick={() => {
                if (col.link) {
                  window.location.href = col.link;
                }
              }}
            />
          ))}

        </div>

      </div>

    </section>
  );
};

export default StoreCollectionsSection;