import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import SellerStore from "../dropshipper/SellerStore";

const StoreLoader = () => {

const [seller,setSeller] = useState(null);

useEffect(()=>{

const loadStore = async()=>{

const domain = window.location.host;

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

};

loadStore();

},[]);

if(!seller){
return <h2>Store not found</h2>;
}

return <SellerStore seller={seller} />;

};

export default StoreLoader;