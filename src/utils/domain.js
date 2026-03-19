export const MAIN_DOMAIN = "localhost:3000";

export const isMainDomain = () => {

const host = window.location.host;

return (
host === MAIN_DOMAIN
);

};