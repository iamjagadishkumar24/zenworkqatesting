import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { QAProvider } from "@/lib/qa/store";
import { EnvironmentProvider } from "@/lib/qa/environment";
import { TaxYearProvider } from "@/lib/qa/taxYear";
import { Toaster } from "@/components/ui/sonner";

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
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong.</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
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
    ],
    links: [{ rel: "stylesheet", href: appCss }],
      ...[
        { rel: "icon", type: "image/png", href: "/__l5e/assets-v1/b145787e-c597-4847-9e0d-56313bb305d3/zenwork-logo.png" },
        { rel: "apple-touch-icon", href: "/__l5e/assets-v1/b145787e-c597-4847-9e0d-56313bb305d3/zenwork-logo.png" },
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
