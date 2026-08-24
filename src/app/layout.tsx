import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Body typeface, self-hosted via next/font/google (bundled at build time,
 * not fetched at request time) and bound to the `--font-sans` variable
 * globals.css uses for font-family.
 */
const inter = Inter({
    variable: "--font-sans",
    subsets: ["latin"],
});

/**
 * Monospace typeface, self-hosted like `inter`, bound to `--font-mono` for
 * command-console and code-like text (e.g. the command input/log).
 */
const jetbrainsMono = JetBrains_Mono({
    variable: "--font-mono",
    subsets: ["latin"],
});

/**
 * Static page metadata (tab title, meta description) for the app, read by
 * Next.js's App Router — its file-based routing convention — rather than
 * rendered by any component here.
 */
export const metadata: Metadata = {
    title: "Blast Radius",
    description:
        "Sketch a system architecture in plain text, then step through a simulated attacker's path across it.",
};

/**
 * Root Server Component every route renders inside of. Owns the
 * `<html>`/`<body>` shell, wires up the two self-hosted font variables for
 * descendant client components, and defers to `children` (in practice
 * `page.tsx`, mounting the client-side workspace).
 *
 * @param children - Routed page content rendered inside the shared shell.
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
