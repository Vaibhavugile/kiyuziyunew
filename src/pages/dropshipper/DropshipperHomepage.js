import React, { useEffect, useState } from "react";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { db, storage } from "../../firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../../components/AuthContext";
import "./DropshipperHomepage.css";
import StorePreview from "../store/StorePreview";
const DropshipperHomepage = () => {
  const { currentUser } = useAuth();

  const [userData, setUserData] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
const [previewDevice, setPreviewDevice] = useState("desktop");
  /* 🔥 NEW: COLLECTION LIST */
  const [collectionsList, setCollectionsList] = useState([]);

  /* ================= STATES ================= */

  const [navbar, setNavbar] = useState({
    logo: "",
    brandName: ""
  });

  const [hero, setHero] = useState({
    layout: "split",

    title: "",
    subtitle: "",

    images: [],
    slides: [],

    buttonText: "Shop Now",
    secondaryButton: "Explore",

    features: []
  });
  const [theme, setTheme] = useState({
    colors: {
      primary: "#C9A34E",
      background: "#ffffff",
      text: "#111111"
    },
    font: "Playfair Display"
  });

  const [sections, setSections] = useState([]);

  /* ================= LOAD ================= */

  useEffect(() => {
    if (!currentUser) return;

    const load = async () => {
      try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          setInitialLoading(false);
          return;
        }

        const user = userSnap.data();
        setUserData(user);

        if (!user.storeDomain) {
          setInitialLoading(false);
          return;
        }

        /* 🔥 LOAD ALL COLLECTIONS */
        const collectionsSnap = await getDocs(collection(db, "collections"));
        setCollectionsList(
          collectionsSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
          }))
        );

        const snap = await getDoc(
          doc(db, "storeHomepages", user.storeDomain)
        );

        if (snap.exists()) {
          const data = snap.data();

          setNavbar(data.navbar || {});
          setHero(prev => ({ ...prev, ...data.hero }));
          setTheme(data.theme || theme);
          setSections(data.sections || []);
        }
      } catch (err) {
        console.error("❌ Load error:", err);
      }

      setInitialLoading(false);
    };

    load();
  }, [currentUser]);

  /* ================= UPLOAD ================= */

  const uploadImage = async (file, folder) => {
    if (!file || !userData?.storeDomain) return null;

    const path = `${folder}/${userData.storeDomain}/${Date.now()}`;
    const storageRef = ref(storage, path);

    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  };

  /* ================= HERO ================= */

  const handleAddHeroImages = async (files) => {

    const urls = [];

    for (const file of files) {

      const url = await uploadImage(file, "hero");

      if (url) {
        urls.push({ src: url });
      }

    }

    setHero(prev => ({
      ...prev,
      images: [...(prev.images || []), ...urls]
    }));

  };
  /* ================= HERO CAROUSEL ================= */

  const addSlide = () => {
    setHero(prev => ({
      ...prev,
      slides: [
        ...(prev.slides || []),
        {
          image: "",
          mobileImage: "",
          tagline: "",
          title: "",
          desc: "",
          buttonText: "Shop Now",
          link: "#collections"
        }
      ]
    }));
  };

  const updateSlide = (index, field, value) => {
    setHero(prev => ({
      ...prev,
      slides: prev.slides.map((s, i) =>
        i === index ? { ...s, [field]: value } : s
      )
    }));
  };

  const removeSlide = (index) => {
    setHero(prev => ({
      ...prev,
      slides: prev.slides.filter((_, i) => i !== index)
    }));
  };

  const uploadSlideImage = async (file, index, field) => {
    const url = await uploadImage(file, "hero");

    if (!url) return;

    updateSlide(index, field, url);
  };

  const removeHeroImage = (index) => {
    setHero(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const addFeature = () => {
    setHero(prev => ({
      ...prev,
      features: [...(prev.features || []), ""]
    }));
  };

  const updateFeature = (index, value) => {
    setHero(prev => ({
      ...prev,
      features: prev.features.map((f, i) =>
        i === index ? value : f
      )
    }));
  };

  const removeFeature = (index) => {
    setHero(prev => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index)
    }));
  };

  /* ================= COLLECTION HELPERS ================= */

  const updateCollection = (secIndex, colIndex, field, value) => {
    setSections(prev =>
      prev.map((sec, i) =>
        i === secIndex
          ? {
            ...sec,
            collections: sec.collections.map((col, ci) =>
              ci === colIndex
                ? { ...col, [field]: value }
                : col
            )
          }
          : sec
      )
    );
  };

  const addCollectionImages = async (secIndex, colIndex, files) => {

    const urls = [];

    for (const file of files) {

      const url = await uploadImage(file, "collections");

      if (url) urls.push(url);

    }

    setSections(prev =>
      prev.map((sec, i) =>
        i === secIndex
          ? {
            ...sec,
            collections: sec.collections.map((col, ci) =>
              ci === colIndex
                ? {
                  ...col,
                  additionalImages: [
                    ...(col.additionalImages || []),
                    ...urls
                  ]
                }
                : col
            )
          }
          : sec
      )
    );

  };

  const removeCollectionImage = (secIndex, colIndex, imgIndex) => {
    setSections(prev =>
      prev.map((sec, i) =>
        i === secIndex
          ? {
            ...sec,
            collections: sec.collections.map((col, ci) =>
              ci === colIndex
                ? {
                  ...col,
                  additionalImages:
                    col.additionalImages.filter(
                      (_, ii) => ii !== imgIndex
                    )
                }
                : col
            )
          }
          : sec
      )
    );
  };

  /* ================= SAVE ================= */

  const handleSave = async () => {
    if (!userData?.storeDomain) {
      alert("No store domain");
      return;
    }

    setLoading(true);

    try {
      await setDoc(
        doc(db, "storeHomepages", userData.storeDomain),
        {
          navbar,
          hero,
          theme,
          sections
        },
        { merge: true }
      );

      alert("✅ Saved!");
    } catch (err) {
      console.error("❌ Save error:", err);
      alert("Error saving");
    }

    setLoading(false);
  };

  /* ================= UI ================= */

  if (initialLoading) {
    return <div style={{ padding: "40px" }}>Loading...</div>;
  }

  return (
    <div className="builder-layout">

  {/* LEFT SIDE — EDITOR */}
  <div className="builder-editor">

    <div className="customization-container">

      <h2>Store Customization</h2>

      {/* NAVBAR */}
      <div className="section-card">
        <h3>Navbar</h3>

        <input
          placeholder="Brand Name"
          value={navbar.brandName || ""}
          onChange={(e) =>
            setNavbar(prev => ({
              ...prev,
              brandName: e.target.value
            }))
          }
        />

        <input
          type="file"
          onChange={async (e) => {
            const url = await uploadImage(e.target.files[0], "navbar");
            if (url) {
              setNavbar(prev => ({ ...prev, logo: url }));
            }
          }}
        />

        {navbar.logo && (
          <div className="image-preview">
            <img src={navbar.logo} alt="" />
          </div>
        )}
      </div>


      {/* HERO */}
     <div className="section-card">

  <h3>Hero</h3>

  <h4>Hero Layout</h4>

  <select
    value={hero.layout}
    onChange={(e)=>
      setHero(prev=>({
        ...prev,
        layout:e.target.value
      }))
    }
  >
    <option value="split">Split Hero</option>
    <option value="center">Centered Hero</option>
    <option value="carousel">Carousel Hero</option>
    <option value="minimal">Minimal Hero</option>
  </select>


  {/* TITLE + SUBTITLE (not for carousel) */}
  {hero.layout !== "carousel" && (
    <>
      <input
        placeholder="Title"
        value={hero.title}
        onChange={(e)=>
          setHero(prev=>({
            ...prev,
            title:e.target.value
          }))
        }
      />

      <input
        placeholder="Subtitle"
        value={hero.subtitle}
        onChange={(e)=>
          setHero(prev=>({
            ...prev,
            subtitle:e.target.value
          }))
        }
      />
    </>
  )}


  {/* FEATURES (only for split hero) */}
  {hero.layout === "split" && (
    <>
      <h4>Hero Features</h4>

      <button className="add-btn" onClick={addFeature}>
        + Add Feature
      </button>

      <div className="features-editor">

        {hero.features?.map((f,i)=>(
          <div key={i} className="feature-row">

            <input
              placeholder="Feature text"
              value={f}
              onChange={(e)=>updateFeature(i,e.target.value)}
            />

            <button
              className="secondary"
              onClick={()=>removeFeature(i)}
            >
              Remove
            </button>

          </div>
        ))}

      </div>
    </>
  )}


  {/* HERO IMAGES (not for carousel) */}
  {hero.layout !== "carousel" && (
    <>

      <h4>Hero Images</h4>

      <input
        type="file"
        multiple
        onChange={(e)=>handleAddHeroImages(e.target.files)}
      />

      <div className="image-preview">

        {hero.images?.map((img,i)=>(
          <div key={i}>

            <img src={img.src} alt="" />

            <button
              className="secondary"
              onClick={()=>removeHeroImage(i)}
            >
              Remove
            </button>

          </div>
        ))}

      </div>

    </>
  )}


  {/* CAROUSEL SLIDES */}
  {hero.layout === "carousel" && (

    <div className="carousel-editor">

      <h4>Carousel Slides</h4>

      <button className="add-btn" onClick={addSlide}>
        + Add Slide
      </button>


      {hero.slides?.map((slide,i)=>(
        <div key={i} className="carousel-slide-card">

          <input
            placeholder="Tagline"
            value={slide.tagline || ""}
            onChange={(e)=>
              updateSlide(i,"tagline",e.target.value)
            }
          />

          <input
            placeholder="Title"
            value={slide.title || ""}
            onChange={(e)=>
              updateSlide(i,"title",e.target.value)
            }
          />

          <input
            placeholder="Description"
            value={slide.desc || ""}
            onChange={(e)=>
              updateSlide(i,"desc",e.target.value)
            }
          />

          <input
            placeholder="Button Text"
            value={slide.buttonText || ""}
            onChange={(e)=>
              updateSlide(i,"buttonText",e.target.value)
            }
          />

          <input
            placeholder="Link"
            value={slide.link || ""}
            onChange={(e)=>
              updateSlide(i,"link",e.target.value)
            }
          />


          <label>Desktop Image</label>
          <input
            type="file"
            onChange={(e)=>
              uploadSlideImage(e.target.files[0],i,"image")
            }
          />

          {slide.image && (
            <div className="image-preview">
              <img src={slide.image} alt="" />
            </div>
          )}


          <label>Mobile Image</label>
          <input
            type="file"
            onChange={(e)=>
              uploadSlideImage(e.target.files[0],i,"mobileImage")
            }
          />

          {slide.mobileImage && (
            <div className="image-preview">
              <img src={slide.mobileImage} alt="" />
            </div>
          )}


          <button
            className="secondary"
            onClick={()=>removeSlide(i)}
          >
            Remove Slide
          </button>

        </div>
      ))}

    </div>

  )}

</div>


      {/* COLLECTION SECTIONS */}
      <div className="section-card">
        <h3>Collections</h3>

        <button
          className="add-btn"
          onClick={() =>
            setSections(prev => [
              ...prev,
              {
                id: Date.now(),
                type: "collections",
                title: "New Section",
                collections: []
              }
            ])
          }
        >
          + Add Section
        </button>

        {sections.map((sec, secIndex) => (
          <div key={sec.id} className="collection-card">

            <input
              value={sec.title}
              onChange={(e) => {
                const updated = [...sections];
                updated[secIndex].title = e.target.value;
                setSections(updated);
              }}
            />

            <button
              className="secondary"
              onClick={() =>
                setSections(prev =>
                  prev.map((s, i) =>
                    i === secIndex
                      ? {
                        ...s,
                        collections: [
                          ...s.collections,
                          {
                            id: Date.now(),
                            title: "",
                            image: "",
                            additionalImages: [],
                            openCollectionId: ""
                          }
                        ]
                      }
                      : s
                  )
                )
              }
            >
              + Add Collection
            </button>

            {sec.collections.map((col, colIndex) => (
              <div key={col.id} className="collection-card">

                <input
                  placeholder="Title"
                  value={col.title}
                  onChange={(e) =>
                    updateCollection(
                      secIndex,
                      colIndex,
                      "title",
                      e.target.value
                    )
                  }
                />

                <select
                  value={col.openCollectionId || ""}
                  onChange={(e) =>
                    updateCollection(
                      secIndex,
                      colIndex,
                      "openCollectionId",
                      e.target.value
                    )
                  }
                >
                  <option value="">Select Collection</option>
                  {collectionsList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>

                <input
                  type="file"
                  onChange={async (e) => {
                    const url = await uploadImage(
                      e.target.files[0],
                      "collections"
                    );
                    updateCollection(secIndex, colIndex, "image", url);
                  }}
                />

                {col.image && (
                  <div className="image-preview">
                    <img src={col.image} alt="" />
                  </div>
                )}

                <input
                  type="file"
                  multiple
                  onChange={(e) =>
                    addCollectionImages(secIndex, colIndex, e.target.files)
                  }
                />

                <div className="image-preview">
                  {col.additionalImages?.map((img, i) => (
                    <div key={i}>
                      <img src={img} alt="" />
                      <button
                        className="secondary"
                        onClick={() =>
                          removeCollectionImage(
                            secIndex,
                            colIndex,
                            i
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="section-card theme-section">

        <h3>Theme</h3>

        {/* PRIMARY COLOR */}
        <div className="theme-color-row">
          <label>Primary Color</label>
          <input
            type="color"
            value={theme.colors.primary}
            onChange={(e) =>
              setTheme(prev => ({
                ...prev,
                colors: { ...prev.colors, primary: e.target.value }
              }))
            }
          />
        </div>

        {/* BACKGROUND */}
        <div className="theme-color-row">
          <label>Background</label>
          <input
            type="color"
            value={theme.colors.background}
            onChange={(e) =>
              setTheme(prev => ({
                ...prev,
                colors: { ...prev.colors, background: e.target.value }
              }))
            }
          />
        </div>

        {/* TEXT COLOR */}
        <div className="theme-color-row">
          <label>Text Color</label>
          <input
            type="color"
            value={theme.colors.text}
            onChange={(e) =>
              setTheme(prev => ({
                ...prev,
                colors: { ...prev.colors, text: e.target.value }
              }))
            }
          />
        </div>

        {/* FONT */}
        <div className="theme-font">
          <label>Font</label>

          <select
            value={theme.font}
            onChange={(e) =>
              setTheme(prev => ({
                ...prev,
                font: e.target.value
              }))
            }
          >
            <option>Playfair Display</option>
            <option>Poppins</option>
            <option>Inter</option>
          </select>
        </div>

      </div>


      {/* SAVE */}
      <button
        className="save-btn"
        onClick={handleSave}
        disabled={loading}
      >
        {loading ? "Saving..." : "Save Changes"}
      </button>

        </div>
  </div>

  {/* RIGHT SIDE — PREVIEW */}
  <div className="builder-preview">

  <h3 style={{marginBottom:"15px"}}>Live Store Preview</h3>

  <div className="preview-toolbar">

    <button
      className={previewDevice === "desktop" ? "active" : ""}
      onClick={() => setPreviewDevice("desktop")}
    >
      Desktop
    </button>

    <button
      className={previewDevice === "tablet" ? "active" : ""}
      onClick={() => setPreviewDevice("tablet")}
    >
      Tablet
    </button>

    <button
      className={previewDevice === "mobile" ? "active" : ""}
      onClick={() => setPreviewDevice("mobile")}
    >
      Mobile
    </button>

  </div>

  <div className="preview-container">

    <div className={`preview-frame ${previewDevice}`}>

      <StorePreview
        navbar={navbar}
        hero={hero}
        theme={theme}
        sections={sections}
      />

    </div>

  </div>

</div>

</div>
    
  );
};

export default DropshipperHomepage;