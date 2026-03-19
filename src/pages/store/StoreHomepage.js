import React, { useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";

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
})

if(!seller) return;

setStore(seller);

const homepageSnap = await getDoc(
doc(db,"storeHomepages",seller.storeSlug)
);

if(homepageSnap.exists()){
setHomepage(homepageSnap.data());
}

};

loadStore();

},[]);

if(!store || !homepage){
return <div style={{padding:"40px"}}>Loading store...</div>;
}

return(

<div>

{/* HERO */}

<section
style={{
backgroundImage:`url(${homepage.hero.image})`,
padding:"120px 40px",
textAlign:"center",
color:"#fff"
}}
>

<h1>{homepage.hero.title}</h1>

<p>{homepage.hero.subtitle}</p>

<a href={`/store/${store.storeSlug}`}>
<button>
{homepage.hero.buttonText}
</button>
</a>

</section>


{/* FEATURED COLLECTIONS */}

<section style={{padding:"60px"}}>

<h2>Collections</h2>

<div style={{
display:"grid",
gridTemplateColumns:"repeat(4,1fr)",
gap:"20px"
}}>

{homepage.featuredCollections.map(col=>(

<div key={col.id}>

<img
src={col.image}
style={{width:"100%"}}
/>

<h4>{col.name}</h4>

</div>

))}

</div>

</section>


{/* TESTIMONIALS */}

<section style={{padding:"60px",background:"#fafafa"}}>

<h2>Testimonials</h2>

{homepage.testimonials.map((t,i)=>(

<div key={i}>

<p>"{t.text}"</p>

<strong>- {t.name}</strong>

</div>

))}

</section>

</div>

);

};

export default StoreHomepage;
