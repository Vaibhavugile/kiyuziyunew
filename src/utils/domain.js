export const MAIN_DOMAIN = "kiyuziyuofficial.com";

export const getCleanDomain = () => {
  return window.location.host
    .replace("www.", "")
    .split(":")[0];
};

export const isMainDomain = () => {
  const host = getCleanDomain();

  return (
    host === MAIN_DOMAIN ||
    host.includes("localhost") ||
    host === "127.0.0.1"
  );
};