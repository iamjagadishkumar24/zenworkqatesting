import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { QAProvider } from "@/lib/qa/store";
import { EnvironmentProvider } from "@/lib/qa/environment";
import { TaxYearProvider } from "@/lib/qa/taxYear";
import { Toaster } from "@/components/ui/sonner";
import { DevErrorOverlay } from "@/components/DevErrorOverlay";
import {
  installCacheBustingVersionCheck,
  recoverFromPossibleStaleBundle,
} from "@/lib/cache-busting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const attemptsRef = useRef(0);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    recoverFromPossibleStaleBundle(error, "root_error_boundary");
    // Auto-retry transient failures (network, chunk load) up to 2 times.
    const msg = (error?.message || "").toLowerCase();
    const transient =
      msg.includes("failed to fetch") ||
      msg.includes("networkerror") ||
      msg.includes("load failed") ||
      msg.includes("chunkloaderror") ||
      msg.includes("dynamically imported module") ||
      msg.includes("importing a module script failed");
    if (transient && attemptsRef.current < 2) {
      attemptsRef.current += 1;
      setRetrying(true);
      const t = setTimeout(() => {
        router.invalidate();
        reset();
        setRetrying(false);
      }, 600 * attemptsRef.current);
      return () => clearTimeout(t);
    }
  }, [error, router, reset]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">
          {retrying ? "Reconnecting…" : "We’re refreshing your workspace"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {retrying
            ? "Restoring your session and retrying automatically."
            : error?.message || "A temporary loading issue occurred."}
        </p>
        {!retrying && (
          <div className="mt-6 flex justify-center gap-2">
            <button
              onClick={() => {
                attemptsRef.current = 0;
                router.invalidate();
                reset();
              }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Reload
            </button>
          </div>
        )}
      </div>
      <DevErrorOverlay error={error} />
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Zenwork Testing" },
      {
        name: "description",
        content: "Testing & defect management for tax forms, online filing, and integrations.",
      },
      { property: "og:title", content: "Zenwork Testing" },
      { name: "twitter:title", content: "Zenwork Testing" },
      {
        property: "og:description",
        content: "Testing & defect management for tax forms, online filing, and integrations.",
      },
      {
        name: "twitter:description",
        content: "Testing & defect management for tax forms, online filing, and integrations.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/854205f4-a85f-45d6-81af-40d4f33e5434/id-preview-2369ccfe--87014af9-f373-4dbd-bd76-040fa2668684.lovable.app-1781192162260.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/854205f4-a85f-45d6-81af-40d4f33e5434/id-preview-2369ccfe--87014af9-f373-4dbd-bd76-040fa2668684.lovable.app-1781192162260.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { name: "theme-color", content: "#0b1020" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "Zenwork QA" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/__l5e/assets-v1/d7aa1513-170d-4b5e-a3eb-734ac645e5e2/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/__l5e/assets-v1/11aed044-7dae-4552-b354-f31b3bd3dd70/icon-512.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/__l5e/assets-v1/8017f09b-a0f4-4d81-ad94-5e53d52b9d5c/apple-180.png" },
      { rel: "mask-icon", href: "/__l5e/assets-v1/b145787e-c597-4847-9e0d-56313bb305d3/zenwork-logo.png", color: "#0b1020" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => installCacheBustingVersionCheck(), []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onError = (event: ErrorEvent) => {
      reportLovableError(event.error ?? new Error(event.message), {
        source: "window.onerror",
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      reportLovableError(event.reason, { source: "unhandledrejection" });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <QAProvider>
        <EnvironmentProvider>
          <TaxYearProvider>
            <Outlet />
            <Toaster richColors position="top-right" />
          </TaxYearProvider>
        </EnvironmentProvider>
      </QAProvider>
    </QueryClientProvider>
  );
}
