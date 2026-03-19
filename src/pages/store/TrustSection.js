const TrustSection = ({ theme }) => {

  const items = [
    {
      icon: "✔",
      title: "Certified Jewellery",
      desc: "100% authentic & verified products"
    },
    {
      icon: "🚚",
      title: "Fast Delivery",
      desc: "Quick and secure shipping"
    },
    {
      icon: "🔁",
      title: "Easy Returns",
      desc: "Hassle-free return policy"
    }
  ];

  return (
    <section style={{
      padding: "80px 20px",
      background: theme?.colors?.background || "#fafafa",
      fontFamily: theme?.font
    }}>

      <div style={{
        maxWidth: "1200px",
        margin: "0 auto",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))",
        gap: "30px",
        textAlign: "center"
      }}>

        {items.map((item, i) => (

          <div
            key={i}
            style={{
              padding: "30px 20px",
              borderRadius: "12px",
              background: "#fff",
              boxShadow: "0 10px 25px rgba(0,0,0,0.05)",
              transition: "all 0.3s ease",
              cursor: "default"
            }}
            onMouseOver={(e)=>{
              e.currentTarget.style.transform = "translateY(-5px)";
            }}
            onMouseOut={(e)=>{
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >

            {/* ICON */}
            <div style={{
              fontSize: "28px",
              marginBottom: "10px",
              color: theme?.colors?.primary
            }}>
              {item.icon}
            </div>

            {/* TITLE */}
            <h4 style={{
              marginBottom: "8px",
              fontWeight: "600",
              color: theme?.colors?.text
            }}>
              {item.title}
            </h4>

            {/* DESC */}
            <p style={{
              fontSize: "14px",
              color: "#777"
            }}>
              {item.desc}
            </p>

          </div>

        ))}

      </div>

    </section>
  );

};

export default TrustSection;