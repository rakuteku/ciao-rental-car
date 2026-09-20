const API_ORIGIN = "https://car-fleet-manager.replit.app";
const NO_INDEX = "noindex, nofollow";

function copyResponseWithStagingHeaders(response) {
  const headers = new Headers();

  for (const [name, value] of response.headers) {
    if (name.toLowerCase() !== "set-cookie") {
      headers.append(name, value);
    }
  }

  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : response.headers.get("set-cookie");

  if (Array.isArray(setCookies)) {
    for (const cookie of setCookies) {
      headers.append("Set-Cookie", cookie);
    }
  } else if (setCookies) {
    headers.append("Set-Cookie", setCookies);
  }

  headers.set("X-Robots-Tag", NO_INDEX);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function proxyApi(request) {
  const requestUrl = new URL(request.url);
  const upstreamUrl = new URL(
    `${requestUrl.pathname}${requestUrl.search}`,
    API_ORIGIN,
  );
  const headers = new Headers(request.headers);

  // Let fetch set the upstream Host header while forwarding the remaining
  // request headers, including cookies and authorization headers.
  headers.delete("host");

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  return fetch(upstreamUrl, init);
}

async function serveAsset(request, env) {
  let response = await env.ASSETS.fetch(request);

  if (
    response.status === 404 &&
    (request.method === "GET" || request.method === "HEAD")
  ) {
    const fallbackUrl = new URL("/index.html", request.url);
    response = await env.ASSETS.fetch(
      new Request(fallbackUrl, {
        method: request.method,
        headers: request.headers,
      }),
    );
  }

  return response;
}

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url);
    const response = requestUrl.pathname.startsWith("/api/")
      ? await proxyApi(request)
      : await serveAsset(request, env);

    return copyResponseWithStagingHeaders(response);
  },
};