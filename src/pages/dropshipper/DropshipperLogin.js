import React, { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

const DropshipperLogin = () => {

const [email,setEmail] = useState("");
const [password,setPassword] = useState("");

const navigate = useNavigate();

const handleLogin = async(e)=>{

e.preventDefault();

try{

const res = await signInWithEmailAndPassword(auth,email,password);

const userRef = doc(db,"users",res.user.uid);
const userSnap = await getDoc(userRef);

const userData = userSnap.data();

if(userData.role !== "dropshipper"){
alert("Not a dropshipper account");
return;
}

if(!userData.storeSlug){
navigate("/dropshipper/setup");
}else{
navigate("/dropshipper/dashboard");
}

}catch(err){

alert(err.message);

}

};

return(

<div>

<h2>Dropshipper Login</h2>

<form onSubmit={handleLogin}>

<input
type="email"
placeholder="Email"
value={email}
onChange={(e)=>setEmail(e.target.value)}
required
/>

<input
type="password"
placeholder="Password"
value={password}
onChange={(e)=>setPassword(e.target.value)}
required
/>

<button type="submit">

Login

</button>

</form>
<p>
Don't have an account?
<a href="/dropshipper/signup">
Create Dropshipper Account
</a>
</p>

</div>

)

}

export default DropshipperLogin