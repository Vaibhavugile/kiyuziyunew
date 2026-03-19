const CollectionsSection = ({ data }) => {

  return (
    <section style={{padding:"80px"}}>

      <h2 style={{textAlign:"center"}}>Collections</h2>

      <div style={{
        display:"grid",
        gridTemplateColumns:"repeat(3,1fr)",
        gap:"20px",
        marginTop:"40px"
      }}>

        {data.items.map((item,i)=>(
          <div key={i} style={{position:"relative"}}>

            <img src={item.image} style={{width:"100%"}} />

            <div style={{
              position:"absolute",
              bottom:"20px",
              left:"20px",
              color:"white"
            }}>
              {item.name}
            </div>

          </div>
        ))}

      </div>

    </section>
  );

};

export default CollectionsSection;