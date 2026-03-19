const ProductsSection = ({ products, theme }) => {

  return (
    <section style={{
      padding: "100px 20px",
      maxWidth: "1200px",
      margin: "0 auto",
      fontFamily: theme?.font
    }}>

      {/* TITLE */}
      <h2 style={{
        textAlign: "center",
        fontSize: "32px",
        fontWeight: "500",
        marginBottom: "10px"
      }}>
        Featured Products
      </h2>

      <p style={{
        textAlign: "center",
        color: "#777",
        marginBottom: "50px"
      }}>
        Discover our latest collection
      </p>

      {/* GRID */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
        gap: "30px"
      }}>

        {products.map((p) => (

          <div
            key={p.id}
            style={{
              cursor: "pointer",
              textAlign: "center"
            }}
          >

            {/* IMAGE WRAPPER */}
            <div style={{
              overflow: "hidden",
              borderRadius: "8px"
            }}>
              <img
                src={p.image}
                alt={p.productName}
                style={{
                  width: "100%",
                  height: "300px",
                  objectFit: "cover",
                  transition: "transform 0.5s ease"
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = "scale(1.1)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = "scale(1)";
                }}
              />
            </div>

            {/* NAME */}
            <h4 style={{
              marginTop: "15px",
              fontSize: "16px",
              fontWeight: "500"
            }}>
              {p.productName}
            </h4>

            {/* PRICE */}
            <p style={{
              color: theme?.colors?.primary,
              fontWeight: "600",
              marginTop: "5px"
            }}>
              ₹{p.tieredPricing?.retail?.[0]?.price}
            </p>

          </div>

        ))}

      </div>

    </section>
  );

};

export default ProductsSection;