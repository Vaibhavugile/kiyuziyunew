export const MAIN_DOMAIN = "kiyuziyuofficial.com";

export const getCleanDomain = () => {
  const rawHost = window.location.host.replace("www.", "");
  const domain = rawHost.split(":")[0];
  const port = window.location.port;

  // ✅ Only localhost:3000 acts as main domain
  if (
    (domain === "localhost" || domain === "127.0.0.1") &&
    port === "3000"
  ) {
    return MAIN_DOMAIN;
  }

  // otherwise return actual host
  return rawHost;
};

export const isMainDomain = () => {
  const rawHost = window.location.host.replace("www.", "");

  return (
    rawHost === MAIN_DOMAIN ||
    rawHost === "localhost:3000" ||
    rawHost === "127.0.0.1:3000"
  );
};