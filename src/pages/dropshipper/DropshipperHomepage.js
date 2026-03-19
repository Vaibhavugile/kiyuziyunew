import React, { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db, storage } from "../../firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useAuth } from "../../components/AuthContext";
import "./DropshipperHomepage.css";

const DropshipperHomepage = () => {
  const { currentUser } = useAuth();

  const [userData, setUserData] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);

  /* ================= STATES ================= */

  const [navbar, setNavbar] = useState({
    logo: "",
    brandName: ""
  });

  const [hero, setHero] = useState({
    title: "",
    subtitle: "",
    images: [],
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

  const handleAddHeroImage = async (file) => {
    const url = await uploadImage(file, "hero");
    if (!url) return;

    setHero(prev => ({
      ...prev,
      images: [...(prev.images || []), { src: url }]
    }));
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

  const addCollectionImage = async (secIndex, colIndex, file) => {
    const url = await uploadImage(file, "collections");
    if (!url) return;

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
                        url
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
    <div style={{ padding: "20px", maxWidth: "800px" }}>
      <h2>Store Customization</h2>

      {/* NAVBAR */}
      <div>
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

        <br /><br />

        <input
          type="file"
          onChange={async (e) => {
            const url = await uploadImage(e.target.files[0], "navbar");
            if (url) {
              setNavbar(prev => ({ ...prev, logo: url }));
            }
          }}
        />

        {navbar.logo && <img src={navbar.logo} width="80" alt="" />}
      </div>

      {/* HERO */}
      <div>
        <h3>Hero</h3>

        <input
          placeholder="Title"
          value={hero.title}
          onChange={(e) =>
            setHero(prev => ({ ...prev, title: e.target.value }))
          }
        />

        <br /><br />

        <input
          placeholder="Subtitle"
          value={hero.subtitle}
          onChange={(e) =>
            setHero(prev => ({ ...prev, subtitle: e.target.value }))
          }
        />

        <br /><br />

        <input
          type="file"
          onChange={(e) => handleAddHeroImage(e.target.files[0])}
        />

        {hero.images?.map((img, i) => (
          <div key={i}>
            <img src={img.src} width="80" alt="" />
            <button onClick={() => removeHeroImage(i)}>❌</button>
          </div>
        ))}
      </div>

      {/* SECTIONS */}
      <div>
        <h3>Collections</h3>

        <button
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
          <div key={sec.id}>
            <input
              value={sec.title}
              onChange={(e) => {
                const updated = [...sections];
                updated[secIndex].title = e.target.value;
                setSections(updated);
              }}
            />

            <button
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
                              additionalImages: []
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
              <div key={col.id}>
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

                {/* MAIN IMAGE */}
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

                {col.image && <img src={col.image} width="60" alt="" />}

                {/* ADDITIONAL IMAGES */}
                <input
                  type="file"
                  onChange={(e) =>
                    addCollectionImage(
                      secIndex,
                      colIndex,
                      e.target.files[0]
                    )
                  }
                />

                <div style={{ display: "flex", gap: 8 }}>
                  {col.additionalImages?.map((img, i) => (
                    <div key={i}>
                      <img src={img} width="50" alt="" />
                      <button
                        onClick={() =>
                          removeCollectionImage(
                            secIndex,
                            colIndex,
                            i
                          )
                        }
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* SAVE */}
      <button onClick={handleSave} disabled={loading}>
        {loading ? "Saving..." : "Save"}
      </button>
    </div>
  );
};

export default DropshipperHomepage;