import { defineConfig, type Plugin, type ViteDevServer, type PreviewServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

function seoWellKnownFiles(): Plugin {
  const handle = async (
    req: import("http").IncomingMessage,
    res: import("http").ServerResponse,
    next: () => void,
  ): Promise<void> => {
    const url = req.url ?? "";
    const isRobots = url === "/robots.txt" || url.startsWith("/robots.txt?");
    const isSitemap = url === "/sitemap.xml" || url.startsWith("/sitemap.xml?");

    if (!isRobots && !isSitemap) {
      next();
      return;
    }

    try {
      const host = req.headers.host ?? "localhost";
      const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
      const origin = `${proto}://${host}`;
      const target = isRobots ? "robots.txt" : "sitemap.xml";
      const upstream = await fetch(
        `http://localhost:80/api/${target}?origin=${encodeURIComponent(origin)}`,
      );
      const body = await upstream.text();
      res.statusCode = upstream.status;
      res.setHeader(
        "content-type",
        upstream.headers.get("content-type") ?? "text/plain",
      );
      res.end(body);
    } catch {
      next();
    }
  };

  return {
    name: "seo-well-known-files",
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        void handle(req, res, next);
      });
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use((req, res, next) => {
        void handle(req, res, next);
      });
    },
  };
}

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    seoWellKnownFiles(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
