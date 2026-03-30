import React from "react";
import StoreNavbar from "./StoreNavbar";
import ProductsSection from "./ProductsSection";
import TrustSection from "./TrustSection";
import TestimonialsSection from "./TestimonialsSection";
import CollectionsSection from "./CollectionsSection";
import { HERO_LAYOUTS } from "../storefront/heroes/HeroRegistry";

const StorePreview = ({ navbar, hero, theme, sections }) => {

  const HeroComponent =
    HERO_LAYOUTS[hero?.layout] || HERO_LAYOUTS.split;

  return (
    <div
      style={{
        background: theme?.colors?.background,
        color: theme?.colors?.text,
        fontFamily: theme?.font,
        minHeight: "100vh"
      }}
    >

      {/* NAVBAR */}
      <StoreNavbar
        data={navbar}
        theme={theme}
      />

      {/* HERO */}
      <HeroComponent
        data={hero}
        theme={theme}
      />

      {/* SECTIONS */}
      {sections?.map((sec) => {

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

    </div>
  );
};

export default StorePreview;