import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const workspaceRoot = resolve(import.meta.dirname, "..");
const workerPath = resolve(
  workspaceRoot,
  "artifacts/ciao-rental/staging/cloudflare-pages/_worker.js",
);
const worker = (await import(pathToFileURL(workerPath))).default;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const originalFetch = globalThis.fetch;
let capturedRequest;

try {
  globalThis.fetch = async (input, init) => {
    capturedRequest = new Request(input, {
      ...init,
      ...(init?.body ? { duplex: "half" } : {}),
    });
    return new Response("upstream", {
      status: 201,
      headers: [
        ["content-type", "text/plain"],
        ["set-cookie", "session=abc; Path=/"],
        ["set-cookie", "csrf=def; Path=/"],
      ],
    });
  };

  const apiResponse = await worker.fetch(
    new Request("https://staging.example/api/bookings?draft=true", {
      method: "POST",
      headers: {
        "cookie": "session=abc",
        "x-request-id": "staging-test",
      },
      body: '{"ok":true}',
    }),
    {
      ASSETS: {
        fetch: async () => {
          throw new Error("ASSETS should not be used for API requests");
        },
      },
    },
  );

  assert(
    capturedRequest.url ===
      "https://car-fleet-manager.replit.app/api/bookings?draft=true",
    "API proxy did not preserve the full path and query string",
  );
  assert(capturedRequest.method === "POST", "API proxy did not preserve the method");
  assert(
    capturedRequest.headers.get("cookie") === "session=abc",
    "API proxy did not preserve cookies",
  );
  assert(
    (await capturedRequest.text()) === '{"ok":true}',
    "API proxy did not preserve the request body",
  );
  assert(
    apiResponse.headers.get("x-robots-tag") === "noindex, nofollow",
    "API response is missing the staging robots header",
  );
  assert(
    apiResponse.headers.getSetCookie?.().length === 2 ||
      apiResponse.headers.get("set-cookie")?.includes("session=abc"),
    "API response did not preserve Set-Cookie headers",
  );

  const assetRequests = [];
  const staticResponse = await worker.fetch(
    new Request("https://staging.example/ja/custom-page"),
    {
      ASSETS: {
        fetch: async (request) => {
          assetRequests.push(new URL(request.url).pathname);
          return assetRequests.length === 1
            ? new Response("not found", { status: 404 })
            : new Response("<html>app</html>", {
                headers: { "content-type": "text/html" },
              });
        },
      },
    },
  );

  assert(
    assetRequests.join(",") === "/ja/custom-page,/index.html",
    "Non-API requests did not fall back to /index.html",
  );
  assert(
    staticResponse.headers.get("x-robots-tag") === "noindex, nofollow",
    "Static response is missing the staging robots header",
  );

  const robots = readFileSync(
    resolve(workspaceRoot, "artifacts/ciao-rental/staging/cloudflare-pages/robots.txt"),
    "utf8",
  );
  assert(robots.includes("Disallow: /"), "Staging robots.txt does not block crawlers");

  console.log("Cloudflare Pages staging worker verification passed.");
} finally {
  globalThis.fetch = originalFetch;
}