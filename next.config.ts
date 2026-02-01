import type { NextConfig } from "next";
const withPWA = require("@ducanh2912/next-pwa").default({
    dest: "public",
    cacheOnFrontEndNav: true,
    aggressiveFrontEndNavCaching: true,
    reloadOnOnline: true,
    swMinify: true,
    disable: false, // Enable even in dev for testing if needed, or process.env.NODE_ENV === "development"
    workboxOptions: {
        disableDevLogs: true,
    },
});

const nextConfig: NextConfig = {
    /* config options here */
};

export default withPWA(nextConfig);
