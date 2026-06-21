import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

const NO_STORE = "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";

function withDeploymentCacheHeaders(request: Request, response: Response): Response {
  const next = new Response(response.body, response);
  const url = new URL(request.url);
  const path = url.pathname;
  const contentType = next.headers.get("content-type") ?? "";

  if (
    contentType.includes("text/html") ||
    path === "/api/public/app-version" ||
    path === "/api/public/manifest" ||
    path === "/manifest.webmanifest" ||
    path === "/sw.js" ||
    path === "/service-worker.js"
  ) {
    next.headers.set("Cache-Control", NO_STORE);
    next.headers.set("Pragma", "no-cache");
    next.headers.set("Expires", "0");
    next.headers.set("Clear-Site-Data", '"cache"');
    return next;
  }

  if (/^\/(assets|_build|__vite)\//.test(path) || /\.[a-f0-9]{8,}\.(?:js|mjs|css)$/i.test(path)) {
    next.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (/\.(?:js|mjs|css)$/i.test(path)) {
    next.headers.set("Cache-Control", NO_STORE);
    next.headers.set("Pragma", "no-cache");
    next.headers.set("Expires", "0");
  }

  return next;
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withDeploymentCacheHeaders(request, await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
