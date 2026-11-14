
import React, { useEffect, useState } from "react";
import { doc, getDoc, collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "../../firebase";
import { getCleanDomain } from "../../utils/domain";
import { Helmet } from "react-helmet-async";

/* COMPONENTS */
import StoreNavbar from "./StoreNavbar";
import CollectionsSection from "./CollectionsSection";
import { HERO_LAYOUTS } from "../storefront/heroes/HeroRegistry";
import AboutSection from "./AboutSection";
import TestimonialsSection from "./TestimonialsSection";
import FooterSection from "./FooterSection";
import StoreFloatingContact from "./StoreFloatingContact";
import StoreTopbar from "./StoreTopbar";
import EnquiryFormSection from "./StoreEnquiryFormSection";
import InstagramReelsSection from "./InstagramReelsSection";
import ShopTheLook from "./Shopthelook";

const StoreHomepage = () => {

  const [homepage, setHomepage] = useState(null);
  const [loading, setLoading] = useState(true);

  const [accountBlocked, setAccountBlocked] = useState(false);
  const [statusError, setStatusError] = useState("");

  const HeroComponent =
    HERO_LAYOUTS[homepage?.hero?.layout] || HERO_LAYOUTS.split;

  /* ================= LOAD STORE + CHECK SELLER STATUS ================= */

  useEffect(() => {

    let mounted = true;

    const loadStore = async () => {

      try {

        setLoading(true);
        setAccountBlocked(false);
        setStatusError("");

        const domain = getCleanDomain();

        // 1. Load store homepage
        const homepageRef = doc(db, "storeHomepages", domain);
        const homepageSnap = await getDoc(homepageRef);

        if (!homepageSnap.exists()) {

          console.warn("No homepage found for:", domain);

          if (mounted) {
            setHomepage(null);
            setLoading(false);
          }

          return;
        }

        const data = homepageSnap.data();

        // 2. Find the dropshipper by the current store domain.
        // The matching users document ID is the seller's Firebase UID.
        const sellerQuery = query(
          collection(db, "users"),
          where("storeDomain", "==", domain),
          limit(1)
        );

        const sellerSnapshot = await getDocs(sellerQuery);

        if (sellerSnapshot.empty) {
          console.error("No dropshipper found for store domain:", domain);

          if (mounted) {
            setStatusError(
              "Your store account could not be verified. Please contact the technical team."
            );
            setLoading(false);
          }

          return;
        }

        const sellerDoc = sellerSnapshot.docs[0];
        const sellerId = sellerDoc.id;
        const sellerData = sellerDoc.data();

        console.log("Store seller status:", {
          domain,
          sellerId,
          active: sellerData.active
        });

        // 4. Explicitly false means inactive.
        // Missing active field means active.
        if (sellerData.active === false) {

          if (mounted) {
            setAccountBlocked(true);
            setHomepage(null);
            setLoading(false);
          }

          return;
        }

        // 5. Account is active - show homepage
        if (mounted) {
          setHomepage(data);
          setLoading(false);
        }

      } catch (err) {

        console.error("Store loading / account verification error:", err);

        if (mounted) {
          setStatusError(
            "We could not verify your store account. Please contact the technical team."
          );
          setLoading(false);
        }

      }

    };

    loadStore();

    return () => {
      mounted = false;
    };

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

  /* ================= APPLY THEME GLOBALLY ================= */

  useEffect(() => {

    if (!theme?.colors) return;

    document.documentElement.style.setProperty(
      "--accent",
      theme.colors.primary
    );

    document.documentElement.style.setProperty(
      "--accent-2",
      theme.colors.primary + "80"
    );

    document.documentElement.style.setProperty(
      "--text",
      theme.colors.text
    );

    document.documentElement.style.setProperty(
      "--bg-light",
      theme.colors.background
    );

    document.documentElement.style.setProperty(
      "--bg-soft",
      theme.colors.background
    );

    document.documentElement.style.setProperty(
      "--kj-gold",
      theme.colors.primary
    );

    document.documentElement.style.setProperty(
      "--kj-gold-2",
      theme.colors.primary
    );

    document.documentElement.style.setProperty(
      "--kj-bg",
      theme.colors.background
    );

  }, [theme]);

  /* ================= LOADING ================= */

  if (loading) {

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf9f6",
          color: "#555",
          fontFamily: "sans-serif"
        }}
      >
        Checking store availability...
      </div>
    );

  }

  /* ================= INACTIVE ACCOUNT SCREEN ================= */

  if (accountBlocked || statusError) {

    return (

      <div className="store-account-blocked">

        <div className="store-blocked-card">

          <div className="store-blocked-icon">
            <span>!</span>
          </div>

          <div className="store-blocked-label">
            ACCOUNT ACCESS RESTRICTED
          </div>

          <h1>
            Your Account Is Not Active
          </h1>

          <p>
            {statusError ||
              "Your store account is currently inactive. Access to this storefront has been temporarily restricted."}
          </p>

          <div className="store-blocked-divider"></div>

          <div className="store-blocked-support">

            <div className="store-support-icon">
              ?
            </div>

            <div>
              <strong>Need assistance?</strong>
              <span>
                Please contact our technical team to activate your account.
              </span>
            </div>

          </div>

          <div className="store-blocked-footer">
            STORE ACCESS MANAGEMENT
          </div>

        </div>

        <style>{`

          .store-account-blocked {
            position: fixed;
            inset: 0;
            z-index: 2147483647;
            width: 100%;
            height: 100%;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 22px;
            background:
              radial-gradient(
                circle at 20% 20%,
                rgba(201,163,78,0.10),
                transparent 35%
              ),
              radial-gradient(
                circle at 80% 80%,
                rgba(201,163,78,0.08),
                transparent 35%
              ),
              #111318;
            font-family: Arial, sans-serif;
            box-sizing: border-box;
          }

          .store-blocked-card {
            width: 100%;
            max-width: 490px;
            padding: 48px 38px 30px;
            border-radius: 24px;
            text-align: center;
            background: #ffffff;
            box-shadow: 0 30px 100px rgba(0,0,0,0.35);
            animation: storeBlockedAppear 0.65s ease both;
            box-sizing: border-box;
          }

          .store-blocked-icon {
            width: 76px;
            height: 76px;
            margin: 0 auto 25px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #fff0ed;
            color: #dc5548;
            font-size: 42px;
            font-weight: 700;
          }

          .store-blocked-icon span {
            width: 38px;
            height: 38px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 3px solid currentColor;
            border-radius: 50%;
          }

          .store-blocked-label {
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 2.5px;
            color: #d15b4e;
            margin-bottom: 14px;
          }

          .store-blocked-card h1 {
            margin: 0 0 15px;
            font-size: 29px;
            line-height: 1.2;
            font-weight: 800;
            color: #171923;
          }

          .store-blocked-card > p {
            color: #777d89;
            font-size: 14px;
            line-height: 1.8;
            margin: 0;
          }

          .store-blocked-divider {
            height: 1px;
            background: #eceef1;
            margin: 30px 0;
          }

          .store-blocked-support {
            display: flex;
            align-items: center;
            text-align: left;
            gap: 14px;
            padding: 17px;
            border-radius: 14px;
            background: #f8f7f3;
          }

          .store-support-icon {
            flex-shrink: 0;
            width: 39px;
            height: 39px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #eee6d5;
            color: #9d7a37;
            border-radius: 12px;
            font-size: 19px;
            font-weight: 800;
          }

          .store-blocked-support strong {
            display: block;
            font-size: 13px;
            color: #252833;
            margin-bottom: 5px;
          }

          .store-blocked-support span {
            display: block;
            color: #858a96;
            font-size: 11px;
            line-height: 1.6;
          }

          .store-blocked-footer {
            margin-top: 30px;
            color: #b1b4bc;
            font-size: 9px;
            font-weight: 700;
            letter-spacing: 2px;
          }

          @keyframes storeBlockedAppear {
            from {
              opacity: 0;
              transform: translateY(20px) scale(0.97);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          @media(max-width: 480px) {
            .store-blocked-card {
              padding: 38px 23px 25px;
            }

            .store-blocked-card h1 {
              font-size: 24px;
            }
          }

        `}</style>

      </div>

    );

  }

  /* ================= STORE NOT FOUND ================= */

  if (!homepage) {

    return (
      <div style={{ padding: "40px", color: "red" }}>
        Store not found for this domain.
        <br />
        Check console for DOMAIN mismatch.
      </div>
    );

  }

  /* ================= SEO ================= */

  const storeName =
    homepage?.navbar?.brandName || "Online Store";

  const description =
    homepage?.hero?.subtitle ||
    `Shop premium products from ${storeName}`;

  const domain = getCleanDomain();

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

      <Helmet>

        <title>{storeName}</title>

        <meta name="description" content={description} />

        <meta
          name="keywords"
          content={`${storeName}, jewellery store, online shopping, fashion store`}
        />

        <link
          rel="canonical"
          href={`https://${domain}`}
        />

        <meta property="og:title" content={storeName} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://${domain}`} />

        <meta
          property="og:image"
          content={homepage?.hero?.images?.[0]?.src || "/default-og.jpg"}
        />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={storeName} />
        <meta name="twitter:description" content={description} />

        <meta
          name="twitter:image"
          content={homepage?.hero?.images?.[0]?.src || "/default-og.jpg"}
        />

      </Helmet>

      <StoreTopbar data={homepage?.topbar} />

      <StoreNavbar
        data={homepage?.navbar}
        theme={theme}
      />

      <HeroComponent
        data={homepage.hero}
        theme={theme}
      />

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

          default:
            return null;
        }

      })}

      {homepage?.shopTheLook?.enabled && (
        <ShopTheLook
          data={homepage.shopTheLook}
        />
      )}

      {homepage?.enquiryForm?.enabled && (
        <EnquiryFormSection
          data={homepage.enquiryForm}
          theme={theme}
        />
      )}

      <AboutSection
        data={homepage.about}
        theme={theme}
      />

      <TestimonialsSection
        data={homepage.testimonials}
        theme={theme}
      />

      <FooterSection
        data={homepage.footer}
        theme={theme}
      />

      <StoreFloatingContact
        data={homepage?.floatingContact}
      />

    </div>

  );

};

export default StoreHomepage;
