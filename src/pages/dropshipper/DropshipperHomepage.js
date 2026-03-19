import React, { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { storage } from "../../firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../../components/AuthContext";

const DropshipperHomepage = () => {

  const { currentUser } = useAuth();

  const [sections,setSections] = useState([]);
  const [loading,setLoading] = useState(false);

  const domain = window.location.host;

  /* ================= LOAD ================= */

  useEffect(()=>{

    const load = async()=>{

      const snap = await getDoc(doc(db,"storeHomepages",domain));

      if(snap.exists()){
        setSections(snap.data().sections || []);
      }

    };

    load();

  },[]);


  /* ================= IMAGE UPLOAD ================= */

  const handleImageUpload = async (file,index)=>{

    const path = `storeHomepages/${domain}/${Date.now()}`;

    const storageRef = ref(storage,path);

    await uploadBytes(storageRef,file);

    const url = await getDownloadURL(storageRef);

    const updated = [...sections];
    updated[index].image = url;

    setSections(updated);

  };


  /* ================= ADD SECTION ================= */

  const addSection = (type)=>{

    const base = {
      id: Date.now(),
      type
    };

    if(type === "hero"){
      base.title="";
      base.subtitle="";
      base.image="";
      base.buttonText="Shop Now";
    }

    if(type === "collections"){
      base.items=[];
    }

    if(type === "testimonials"){
      base.items=[];
    }

    setSections(prev => [...prev, base]);

  };


  /* ================= UPDATE ================= */

  const updateSection = (index,field,value)=>{
    const updated = [...sections];
    updated[index][field] = value;
    setSections(updated);
  };


  /* ================= SAVE ================= */

  const handleSave = async()=>{

    setLoading(true);

    await setDoc(
      doc(db,"storeHomepages",domain),
      { sections },
      { merge:true }
    );

    setLoading(false);
    alert("Saved!");

  };


  /* ================= UI ================= */

  return(

    <div style={{padding:"20px"}}>

      <h2>Homepage Builder</h2>

      {/* ADD SECTION */}
      <div style={{marginBottom:"20px"}}>
        <button onClick={()=>addSection("hero")}>+ Hero</button>
        <button onClick={()=>addSection("collections")}>+ Collections</button>
        <button onClick={()=>addSection("testimonials")}>+ Testimonials</button>
      </div>

      {/* SECTIONS */}
      {sections.map((sec,index)=>(

        <div key={sec.id} style={{
          border:"1px solid #ddd",
          padding:"15px",
          marginBottom:"20px"
        }}>

          <h4>{sec.type.toUpperCase()}</h4>

          {/* HERO */}
          {sec.type === "hero" && (
            <>
              <input
                placeholder="Title"
                value={sec.title}
                onChange={(e)=>updateSection(index,"title",e.target.value)}
              />

              <input
                placeholder="Subtitle"
                value={sec.subtitle}
                onChange={(e)=>updateSection(index,"subtitle",e.target.value)}
              />

              <input
                type="file"
                onChange={(e)=>handleImageUpload(e.target.files[0],index)}
              />

              {sec.image && <img src={sec.image} width="200" />}

              <input
                placeholder="Button Text"
                value={sec.buttonText}
                onChange={(e)=>updateSection(index,"buttonText",e.target.value)}
              />
            </>
          )}

          {/* COLLECTIONS */}
          {sec.type === "collections" && (
            <>
              <button onClick={()=>{
                const updated=[...sections];
                updated[index].items.push({name:"",image:""});
                setSections(updated);
              }}>
                + Add Collection
              </button>

              {sec.items.map((item,i)=>(
                <div key={i}>
                  <input
                    placeholder="Name"
                    value={item.name}
                    onChange={(e)=>{
                      const updated=[...sections];
                      updated[index].items[i].name=e.target.value;
                      setSections(updated);
                    }}
                  />

                  <input
                    type="file"
                    onChange={async(e)=>{
                      const file=e.target.files[0];
                      const path=`collections/${Date.now()}`;
                      const storageRef=ref(storage,path);
                      await uploadBytes(storageRef,file);
                      const url=await getDownloadURL(storageRef);

                      const updated=[...sections];
                      updated[index].items[i].image=url;
                      setSections(updated);
                    }}
                  />

                  {item.image && <img src={item.image} width="100" />}
                </div>
              ))}
            </>
          )}

          {/* TESTIMONIALS */}
          {sec.type === "testimonials" && (
            <>
              <button onClick={()=>{
                const updated=[...sections];
                updated[index].items.push({name:"",text:""});
                setSections(updated);
              }}>
                + Add Testimonial
              </button>

              {sec.items.map((item,i)=>(
                <div key={i}>
                  <input
                    placeholder="Name"
                    value={item.name}
                    onChange={(e)=>{
                      const updated=[...sections];
                      updated[index].items[i].name=e.target.value;
                      setSections(updated);
                    }}
                  />

                  <input
                    placeholder="Text"
                    value={item.text}
                    onChange={(e)=>{
                      const updated=[...sections];
                      updated[index].items[i].text=e.target.value;
                      setSections(updated);
                    }}
                  />
                </div>
              ))}
            </>
          )}

        </div>

      ))}

      {/* SAVE */}
      <button onClick={handleSave} disabled={loading}>
        {loading ? "Saving..." : "Save Homepage"}
      </button>

    </div>

  );

};

export default DropshipperHomepage;