import React from "react";

const AboutSection = ({ data, theme }) => {

  if (!data) return null;

  const isMobile = window.innerWidth < 768;

  const textColor = theme?.colors?.text || "#000";
  const primaryColor = theme?.colors?.primary || "#000";

  return (
    <section
      style={{
        padding: isMobile ? "60px 20px" : "120px 20px",
        background: theme?.colors?.background || "#fff",
        fontFamily: theme?.font || "sans-serif"
      }}
    >
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: isMobile ? "40px" : "80px",
          alignItems: "center"
        }}
      >

        {/* IMAGE */}
        {data.image && (
          <div
            style={{
              borderRadius: "18px",
              overflow: "hidden",
              boxShadow: "0 25px 60px rgba(0,0,0,0.25)"
            }}
          >
            <img
              src={data.image}
              alt="About"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover"
              }}
            />
          </div>
        )}

        {/* TEXT */}
        <div>

          {/* Small Label */}
          <div
            style={{
              color: primaryColor,
              fontWeight: "600",
              letterSpacing: "2px",
              marginBottom: "15px",
              fontSize: "13px"
            }}
          >
            OUR STORY
          </div>

          {/* Title */}
          <h2
            style={{
              fontSize: isMobile ? "32px" : "44px",
              marginBottom: "25px",
              fontWeight: "700",
              lineHeight: "1.2",
              color: textColor
            }}
          >
            {data.title}
          </h2>

          {/* Divider */}
          <div
            style={{
              width: "60px",
              height: "3px",
              background: primaryColor,
              marginBottom: "25px"
            }}
          />

          {/* Description */}
          <p
            style={{
              lineHeight: "1.8",
              opacity: 0.9,
              fontSize: isMobile ? "15px" : "17px",
              marginBottom: "35px",
              color: textColor
            }}
          >
            {data.description}
          </p>

          {/* FEATURES */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)",
              gap: "25px"
            }}
          >

            {data.features?.map((f, i) => (

              <div
                key={i}
                style={{
                  padding: "15px",
                  borderRadius: "10px",
                  background: "rgba(0,0,0,0.03)"
                }}
              >

                <strong
                  style={{
                    color: textColor,
                    fontSize: "16px"
                  }}
                >
                  {f.title}
                </strong>

                <p
                  style={{
                    opacity: 0.75,
                    fontSize: "14px",
                    marginTop: "6px",
                    color: textColor
                  }}
                >
                  {f.text}
                </p>

              </div>

            ))}

          </div>

        </div>

      </div>
    </section>
  );
};

export default AboutSection;