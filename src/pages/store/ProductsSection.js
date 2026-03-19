const ProductsSection = ({ products }) => {

  return (
    <section style={{padding:"80px"}}>

      <h2 style={{textAlign:"center"}}>Featured Products</h2>

      <div style={{
        display:"grid",
        gridTemplateColumns:"repeat(4,1fr)",
        gap:"20px",
        marginTop:"40px"
      }}>

        {products.map(p=>(
          <div key={p.id} style={{textAlign:"center"}}>

            <img src={p.image} style={{width:"100%"}} />

            <h4>{p.productName}</h4>

            <p style={{color:"gold"}}>
              ₹{p.tieredPricing?.retail?.[0]?.price}
            </p>

          </div>
        ))}

      </div>

    </section>
  );

};

export default ProductsSection;