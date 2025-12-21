import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "DIFM - Do It For Me",
    description: "Real-time services marketplace",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className="antialiased">
                {children}
            </body>
        </html>
    );
}
