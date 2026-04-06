import React from "react";
import StoreNavbar from "./StoreNavbar";
import CollectionsSection from "./CollectionsSection";
import { HERO_LAYOUTS } from "../storefront/heroes/HeroRegistry";
import AboutSection from "./AboutSection";
const StorePreview = ({ navbar, hero, theme, sections,about }) => {

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

         

          default:
            return null;
        }

      })}
      <AboutSection
    data={about}
    theme={theme}
  />

    </div>
  );
};

export default StorePreview;