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
          console.warn("❌ No storeDomain");
          setInitialLoading(false);
          return;
        }

        const snap = await getDoc(doc(db, "storeHomepages", user.storeDomain));

        if (snap.exists()) {
          const data = snap.data();

          setNavbar(data.navbar || {});
          setHero(prev => ({ ...prev, ...data.hero }));
          setTheme(data.theme || theme);
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

  /* ================= HERO IMAGE HANDLERS ================= */

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

  /* ================= FEATURES ================= */

  const addFeature = () => {
    setHero(prev => ({
      ...prev,
      features: [...(prev.features || []), ""]
    }));
  };

  const updateFeature = (index, value) => {
    const updated = [...hero.features];
    updated[index] = value;

    setHero(prev => ({
      ...prev,
      features: updated
    }));
  };

  const removeFeature = (index) => {
    setHero(prev => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index)
    }));
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
          theme
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

  /* ================= LOADING ================= */

  if (initialLoading) {
    return <div style={{ padding: "40px" }}>Loading...</div>;
  }

  /* ================= UI ================= */

  return (
    <div style={{ padding: "20px", maxWidth: "800px" }}>

      <h2>Store Customization</h2>

      {/* ================= NAVBAR ================= */}
      <div style={{ marginBottom: "30px" }}>
        <h3>Navbar</h3>

        <input
          placeholder="Brand Name"
          value={navbar.brandName || ""}
          onChange={(e) =>
            setNavbar(prev => ({ ...prev, brandName: e.target.value }))
          }
        />

        <br /><br />

        <input
          type="file"
          onChange={async (e) => {
            const file = e.target.files[0];
            const url = await uploadImage(file, "navbar");

            if (url) {
              setNavbar(prev => ({ ...prev, logo: url }));
            }
          }}
        />

        {navbar.logo && <img src={navbar.logo} width="80" alt="logo" />}
      </div>

      {/* ================= HERO ================= */}
      <div style={{ marginBottom: "30px" }}>
        <h3>Hero Section</h3>

        <input
          placeholder="Title"
          value={hero.title || ""}
          onChange={(e) =>
            setHero(prev => ({ ...prev, title: e.target.value }))
          }
        />

        <br /><br />

        <input
          placeholder="Subtitle"
          value={hero.subtitle || ""}
          onChange={(e) =>
            setHero(prev => ({ ...prev, subtitle: e.target.value }))
          }
        />

        <br /><br />

        <input
          placeholder="Primary Button"
          value={hero.buttonText || ""}
          onChange={(e) =>
            setHero(prev => ({ ...prev, buttonText: e.target.value }))
          }
        />

        <br /><br />

        <input
          placeholder="Secondary Button"
          value={hero.secondaryButton || ""}
          onChange={(e) =>
            setHero(prev => ({ ...prev, secondaryButton: e.target.value }))
          }
        />

        <br /><br />

        {/* 🔥 IMAGE UPLOAD */}
        <input
          type="file"
          onChange={(e) => handleAddHeroImage(e.target.files[0])}
        />

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
          {hero.images?.map((img, i) => (
            <div key={i}>
              <img src={img.src} width="80" alt="hero" />
              <button onClick={() => removeHeroImage(i)}>❌</button>
            </div>
          ))}
        </div>

        {/* 🔥 FEATURES */}
        <h4>Features</h4>

        <button onClick={addFeature}>+ Add Feature</button>

        {hero.features?.map((f, i) => (
          <div key={i}>
            <input
              value={f}
              onChange={(e) => updateFeature(i, e.target.value)}
            />
            <button onClick={() => removeFeature(i)}>❌</button>
          </div>
        ))}

      </div>

      {/* ================= THEME ================= */}
      <div style={{ marginBottom: "30px" }}>
        <h3>Theme</h3>

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

        <br /><br />

        <select
          value={theme.font}
          onChange={(e) =>
            setTheme(prev => ({ ...prev, font: e.target.value }))
          }
        >
          <option>Playfair Display</option>
          <option>Poppins</option>
          <option>Inter</option>
        </select>
      </div>

      {/* SAVE */}
      <button onClick={handleSave} disabled={loading}>
        {loading ? "Saving..." : "Save"}
      </button>

    </div>
  );
};

export default DropshipperHomepage;