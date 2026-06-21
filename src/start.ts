import { createStart, createMiddleware } from "@tanstack/react-start";
import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline' https:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
    "connect-src 'self' https: wss:",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ].join("; "),
};

function applyCacheHeaders(request: Request, response: Response) {
  const url = new URL(request.url);
  const path = url.pathname;
  const contentType = response.headers.get("content-type") ?? "";
  if (path === "/api/public/app-version" || path === "/api/public/manifest" || path === "/manifest.webmanifest" || contentType.includes("text/html")) {
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return;
  }
  if (/\.(?:js|mjs|css|woff2?|png|jpe?g|webp|svg|ico)$/i.test(path)) {
    response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }
}

// Apply hardened security headers to every SSR/HTTP response.
const securityHeadersMiddleware = createMiddleware().server(async ({ next, request }) => {
  const result = await next();
  const raw = result as unknown;
  const target: Response | undefined =
    raw instanceof Response
      ? raw
      : raw && typeof raw === "object" && (raw as { response?: unknown }).response instanceof Response
        ? ((raw as { response: Response }).response)
        : undefined;
  if (target && target.headers) {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      if (!target.headers.has(k)) target.headers.set(k, v);
    }
    applyCacheHeaders(request, target);
  }
  return result;
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, securityHeadersMiddleware],
}));
