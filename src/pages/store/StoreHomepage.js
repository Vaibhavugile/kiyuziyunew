import React, { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { getCleanDomain } from "../../utils/domain";
/* COMPONENTS */
import StoreNavbar from "./StoreNavbar";
import StoreHeroSection from "./StoreHeroSection";
import ProductsSection from "./ProductsSection";
import TrustSection from "./TrustSection";
import TestimonialsSection from "./TestimonialsSection";
import CollectionsSection from "./CollectionsSection";
const StoreHomepage = () => {

    const [homepage, setHomepage] = useState(null);
    const [loading, setLoading] = useState(true);

    /* ================= LOAD STORE ================= */
    useEffect(() => {

        const loadStore = async () => {
            try {
                const domain = getCleanDomain();

                console.log("🌐 DOMAIN:", domain);

                const homepageRef = doc(db, "storeHomepages", domain);
                const homepageSnap = await getDoc(homepageRef);

                if (homepageSnap.exists()) {
                    const data = homepageSnap.data();

                    console.log("✅ Homepage loaded:", data);

                    setHomepage(data);
                } else {
                    console.warn("❌ No homepage found for:", domain);
                }

            } catch (err) {
                console.error("❌ Load error:", err);
            }

            setLoading(false);
        };

        loadStore();

    }, []);

    /* ================= THEME ================= */
    const theme = homepage?.theme || {
        colors: {
            primary: "#C9A34E",
            background: "#ffffff",
            text: "#111111"
        },
        font: "sans-serif"
    };

    /* ================= APPLY THEME GLOBALLY 🔥 ================= */
    useEffect(() => {
        if (!theme?.colors) return;

        console.log("🎨 Applying theme globally:", theme);

        // HERO + GLOBAL CSS
        document.documentElement.style.setProperty("--accent", theme.colors.primary);
        document.documentElement.style.setProperty("--accent-2", theme.colors.primary + "80");
        document.documentElement.style.setProperty("--text", theme.colors.text);
        document.documentElement.style.setProperty("--bg-light", theme.colors.background);
        document.documentElement.style.setProperty("--bg-soft", theme.colors.background);

        // NAVBAR CSS (your existing system)
        document.documentElement.style.setProperty("--kj-gold", theme.colors.primary);
        document.documentElement.style.setProperty("--kj-gold-2", theme.colors.primary);
        document.documentElement.style.setProperty("--kj-bg", theme.colors.background);

    }, [theme]);

    /* ================= LOADING ================= */
    if (loading) {
        return (
            <div style={{ padding: "40px" }}>
                Loading store...
            </div>
        );
    }

    if (!homepage) {
        return (
            <div style={{ padding: "40px", color: "red" }}>
                ❌ Store not found for this domain
                <br />
                Check console for DOMAIN mismatch
            </div>
        );
    }

    /* ================= UI ================= */

    return (
        <div
            style={{
                background: theme.colors.background,
                color: theme.colors.text,
                fontFamily: theme.font,
                minHeight: "100vh",
                margin: 0,
    padding: 0
            }}
        >

            {/* 🔥 NAVBAR */}
            <StoreNavbar
                data={homepage?.navbar}
                theme={theme}
            />

            {/* 🔥 HERO */}
            {homepage?.hero && (
    <StoreHeroSection
        data={homepage.hero}
        theme={theme}
    />
)}

            {/* 🔥 OTHER SECTIONS */}
            {homepage?.sections?.map((sec) => {

                switch (sec.type) {

                   case "collections":
    return (
        <CollectionsSection
            key={sec.id}
            data={sec}
            theme={theme}
        />
    );


                    case "products":
                        return (
                            <ProductsSection
                                key={sec.id}
                                products={sec.products || []}
                                theme={theme}
                            />
                        );


                    case "testimonials":
                        return (
                            <TestimonialsSection
                                key={sec.id}
                                data={sec}
                                theme={theme}
                            />
                        );

                    default:
                        return null;
                }

            })}

            {/* 🔥 TRUST */}
            {/* <TrustSection theme={theme} /> */}

        </div>
    );
};

export default StoreHomepage;