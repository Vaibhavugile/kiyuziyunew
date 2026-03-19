const TestimonialsSection = ({ data, theme }) => {

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
        Testimonials
      </h2>

      <p style={{
        textAlign: "center",
        color: "#777",
        marginBottom: "50px"
      }}>
        What our customers say
      </p>

      {/* GRID */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: "30px"
      }}>

        {data.items.map((t, i) => (

          <div
            key={i}
            style={{
              background: "#fff",
              padding: "30px",
              borderRadius: "12px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
              transition: "transform 0.3s ease"
            }}
            onMouseOver={(e)=>{
              e.currentTarget.style.transform = "translateY(-5px)";
            }}
            onMouseOut={(e)=>{
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >

            {/* TEXT */}
            <p style={{
              fontSize: "15px",
              lineHeight: "1.6",
              color: theme?.colors?.text,
              marginBottom: "20px"
            }}>
              “{t.text}”
            </p>

            {/* NAME */}
            <strong style={{
              color: theme?.colors?.primary,
              fontSize: "14px"
            }}>
              — {t.name}
            </strong>

          </div>

        ))}

      </div>

    </section>
  );

};

export default TestimonialsSection;