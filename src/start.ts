import { createStart, createMiddleware } from "@tanstack/react-start";
import { setResponseHeaders } from "@tanstack/react-start/server";
import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// Apply hardened security headers to every SSR/HTTP response.
// CSP intentionally allows inline styles (Tailwind/shadcn runtime styles) and
// the Lovable asset CDN path. Adjust the script-src/connect-src lists if you
// add new third-party origins.
const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next();
  try {
    setResponseHeaders({
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
    });
  } catch {
    /* response already committed */
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
