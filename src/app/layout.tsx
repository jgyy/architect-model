import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/** Body typeface, self-hosted at build time (not fetched at request time); bound to `--font-sans`. */
const inter = Inter({
    variable: "--font-sans",
    subsets: ["latin"],
});

/** Monospace typeface, self-hosted like `inter`; bound to `--font-mono`. */
const jetbrainsMono = JetBrains_Mono({
    variable: "--font-mono",
    subsets: ["latin"],
});

/**
 * Page metadata, read via Next.js's App Router convention rather than
 * rendered by a component.
 */
export const metadata: Metadata = {
    title: "Blast Radius",
    description:
        "Sketch a system architecture in plain text, then step through a simulated attacker's path across it.",
};

/**
 * Root Server Component owning the `<html>`/`<body>` shell and font
 * variables.
 *
 * @param children - routed content (in practice `page.tsx`)
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
    return (
        <html
            lang="en"
            className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
        >
            <body className="min-h-full flex flex-col">{children}</body>
        </html>
    );
}
