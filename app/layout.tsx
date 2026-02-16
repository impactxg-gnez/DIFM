import type { Metadata, Viewport } from "next";
import "./globals.css";
import { GoogleMapsLoader } from "@/components/GoogleMapsLoader";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
    title: "DIFM - Do It For Me",
    description: "Real-time services marketplace",
    manifest: "/manifest.json",
    appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent",
        title: "DIFM",
    },
};

export const viewport: Viewport = {
    themeColor: "#1E1E20",
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className="antialiased">
                <GoogleMapsLoader />
                {children}
                <Analytics />
            </body>
        </html>
    );
}
