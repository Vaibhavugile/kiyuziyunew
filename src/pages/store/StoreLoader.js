import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Routes, Route } from "react-router-dom";

import { db} from "../../firebase";
import { StoreAuthProvider } from "./StoreAuthContext";

import SellerStore from "../dropshipper/SellerStore";
import StoreLogin from "./StoreLogin";
import StoreSignup from "./StoreSignup";
import StoreCartPage from "./StoreCartPage";
import StoreCheckoutPage from "./StoreCheckoutPage";
import StoreMyOrders from "./StoreMyOrders";
import StoreNavbar from "./StoreNavbar";
import { StoreCartProvider } from "./StoreCartContext";
import { getCleanDomain } from "../../utils/domain";
import { doc, getDoc, } from "firebase/firestore";
const StoreLoader = () => {

    const [seller, setSeller] = useState(null);
    const [loading, setLoading] = useState(true);
    const [homepage, setHomepage] = useState(null);
  useEffect(()=>{

const loadStore = async()=>{

try{

const domain = getCleanDomain();

/* ================= SELLER ================= */

const q = query(
collection(db,"users"),
where("storeDomain","==",domain)
);

const snap = await getDocs(q);

if(!snap.empty){

const sellerData = {
id:snap.docs[0].id,
...snap.docs[0].data()
};

setSeller(sellerData);

/* ================= HOMEPAGE ================= */

const homepageRef = doc(db,"storeHomepages",domain);
const homepageSnap = await getDoc(homepageRef);

if(homepageSnap.exists()){
setHomepage(homepageSnap.data());
}

}

}catch(err){
console.error("Store load error:",err);
}

setLoading(false);

};

loadStore();

},[]);

/* load homepage config */


    if (loading) {
        return <h2 style={{ padding: "40px" }}>Loading store...</h2>;
    }

    if (!seller) {
        return <h2 style={{ padding: "40px" }}>Store not found</h2>;
    }

    return (

        <StoreAuthProvider sellerId={seller.id}>
            <StoreCartProvider>
               <StoreNavbar
data={homepage?.navbar}
theme={homepage?.theme}
/>

                <Routes>
                    <Route path="/" element={<SellerStore seller={seller} />} />

                    <Route path="login" element={<StoreLogin />} />

                    <Route path="signup" element={<StoreSignup />} />
                    <Route path="cart" element={<StoreCartPage />} />

                    <Route path="checkout" element={<StoreCheckoutPage />} />
                    <Route path="orders" element={<StoreMyOrders />} />

                </Routes>
            </StoreCartProvider>

        </StoreAuthProvider>

    );

};

export default StoreLoader;
