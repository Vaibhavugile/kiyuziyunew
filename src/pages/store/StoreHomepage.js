import React, { useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";

/* ✅ IMPORT YOUR SECTIONS */
import HeroSection from "./HeroSection";
import CollectionsSection from "./CollectionsSection";
import ProductsSection from "./ProductsSection";
import TrustSection from "./TrustSection";
import TestimonialsSection from "./TestimonialsSection";

const StoreHomepage = () => {

  const [store,setStore] = useState(null);
  const [homepage,setHomepage] = useState(null);

  useEffect(()=>{

    const loadStore = async()=>{

      const domain = window.location.host;

      const usersSnap = await getDocs(collection(db,"users"));

      let seller = null;

      usersSnap.forEach(doc=>{
        if(doc.data().storeDomain === domain){
          seller = { id:doc.id, ...doc.data() }
        }
      });

      if(!seller) return;

      setStore(seller);

      /* 🔥 FIX: USE DOMAIN */
      const homepageSnap = await getDoc(
        doc(db,"storeHomepages",domain)
      );

      if(homepageSnap.exists()){
        setHomepage(homepageSnap.data());
      }

    };

    loadStore();

  },[]);


  /* ===============================
  LOADING
  =============================== */

  if(!store || !homepage){
    return <div style={{padding:"40px"}}>Loading store...</div>;
  }


  /* ===============================
  UI (UPDATED)
  =============================== */

  return(

    <div>
{homepage.sections?.map((sec, index) => {

  switch(sec.type){

    case "hero":
      return <HeroSection key={index} data={sec} store={store} />

    case "collections":
      return <CollectionsSection key={index} data={sec} />

    case "testimonials":
      return <TestimonialsSection key={index} data={sec} />

    default:
      return null;
  }

})}

<TrustSection />

    </div>

  );

};

export default StoreHomepage;