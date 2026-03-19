const TestimonialsSection = ({ data }) => {

  return (
    <section style={{padding:"80px"}}>

      <h2 style={{textAlign:"center"}}>Testimonials</h2>

      {data.items.map((t,i)=>(
        <div key={i} style={{marginTop:"20px"}}>
          <p>"{t.text}"</p>
          <strong>- {t.name}</strong>
        </div>
      ))}

    </section>
  );

};

export default TestimonialsSection;