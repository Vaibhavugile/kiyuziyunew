import React, { useState } from "react";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../../firebase";
import { doc, setDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

const DropshipperSignup = () => {

const [name,setName] = useState("");
const [email,setEmail] = useState("");
const [password,setPassword] = useState("");

const navigate = useNavigate();

const handleSignup = async(e)=>{

e.preventDefault();

try{

const res = await createUserWithEmailAndPassword(auth,email,password);

const uid = res.user.uid;

await setDoc(doc(db,"users",uid),{

name,
email,
role:"dropshipper",
createdAt:new Date()

});

navigate("/dropshipper/setup");

}catch(err){

alert(err.message);

}

};

return(

<div>

<h2>Dropshipper Sign Up</h2>

<form onSubmit={handleSignup}>

<input
type="text"
placeholder="Full Name"
value={name}
onChange={(e)=>setName(e.target.value)}
required
/>

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

Create Dropshipper Account

</button>

</form>

</div>

)

}

export default DropshipperSignup