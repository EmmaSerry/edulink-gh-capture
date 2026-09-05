import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
// EduLink GH Capture - the offline, phone-first data-capture app. Unlike
// the cloud dashboard (which deliberately registers no service worker,
// since report generation and analytics must always hit a live server),
// this app's entire purpose is working with no connection, so the app
// shell itself is precached and a navigateFallback keeps every route
// available offline, including ones never visited before going offline.
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["icons/favicon.svg"],
            manifest: {
                id: "/",
                name: "EduLink GH Capture",
                short_name: "EduLink Capture",
                description: "Offline data capture for schools with no signal - registers students and records assessment data, syncing to EduLink GH once online.",
                theme_color: "#123363",
                background_color: "#ffffff",
                display: "standalone",
                start_url: "/",
                scope: "/",
                orientation: "any",
                icons: [
                    { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
                    { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
                    { src: "icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
                ],
            },
            workbox: {
                globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
                navigateFallback: "/index.html",
            },
            devOptions: {
                enabled: true,
            },
        }),
    ],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "@components": path.resolve(__dirname, "./src/components"),
            "@pages": path.resolve(__dirname, "./src/pages"),
            "@layouts": path.resolve(__dirname, "./src/layouts"),
            "@services": path.resolve(__dirname, "./src/services"),
            "@contexts": path.resolve(__dirname, "./src/contexts"),
            "@hooks": path.resolve(__dirname, "./src/hooks"),
            "@styles": path.resolve(__dirname, "./src/styles"),
        },
    },
    build: {
        target: "es2020",
        sourcemap: true,
        minify: "esbuild",
        cssMinify: true,
        chunkSizeWarningLimit: 600,
    },
});
