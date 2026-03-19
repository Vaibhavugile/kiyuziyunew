const HeroSection = ({ data }) => {

  return (
    <section
      style={{
        height: "100vh",
        backgroundImage: `url(${data.image})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "flex",
        alignItems: "center",
        padding: "0 80px",
        color: "white"
      }}
    >

      <div>
        <h1 style={{
          fontSize: "60px",
          fontFamily: "Playfair Display"
        }}>
          {data.title}
        </h1>

        <p style={{marginTop:"10px"}}>
          {data.subtitle}
        </p>

        <button style={{
          marginTop:"20px",
          padding:"12px 28px",
          border:"1px solid gold",
          background:"transparent",
          color:"gold"
        }}>
          {data.buttonText}
        </button>

      </div>

    </section>
  );

};

export default HeroSection;