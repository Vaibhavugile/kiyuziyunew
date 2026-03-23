import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Routes, Route } from "react-router-dom";

import { db } from "../../firebase";
import { StoreAuthProvider } from "./StoreAuthContext";

import SellerStore from "../dropshipper/SellerStore";
import StoreLogin from "./StoreLogin";
import StoreSignup from "./StoreSignup";
import StoreCartPage from "./StoreCartPage";
import StoreCheckoutPage from "./StoreCheckoutPage";

import { getCleanDomain } from "../../utils/domain";

const StoreLoader = () => {

const [seller,setSeller] = useState(null);
const [loading,setLoading] = useState(true);

useEffect(()=>{

const loadStore = async()=>{

try{

const domain = getCleanDomain();

const q = query(
collection(db,"users"),
where("storeDomain","==",domain)
);

const snap = await getDocs(q);

if(!snap.empty){

setSeller({
id:snap.docs[0].id,
...snap.docs[0].data()
});

}

}catch(err){
console.error("Store load error:",err);
}

setLoading(false);

};

loadStore();

},[]);

if(loading){
return <h2 style={{padding:"40px"}}>Loading store...</h2>;
}

if(!seller){
return <h2 style={{padding:"40px"}}>Store not found</h2>;
}

return(

<StoreAuthProvider sellerId={seller.id}>

<Routes>
<Route path="/" element={<SellerStore seller={seller} />} />

<Route path="login" element={<StoreLogin />} />

<Route path="signup" element={<StoreSignup />} />
<Route path="cart" element={<StoreCartPage />} />

<Route path="checkout" element={<StoreCheckoutPage />} />

</Routes>

</StoreAuthProvider>

);

};

export default StoreLoader;
