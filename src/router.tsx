import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { routeTree } from "./routeTree.gen";
import { reportLovableError } from "./lib/lovable-error-reporting";
import { recoverFromPossibleStaleBundle } from "./lib/cache-busting";

function DefaultErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    reportLovableError(error, { boundary: "router_default_error" });
    recoverFromPossibleStaleBundle(error, "router_default_error");
  }, [error]);
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <h2 className="text-lg font-semibold">Something went wrong loading this section</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {error?.message || "An unexpected error occurred."}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => reset()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}

function DefaultNotFoundComponent() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4 text-center">
      <h2 className="text-lg font-semibold">Not found</h2>
      <p className="text-sm text-muted-foreground">
        This resource doesn't exist or has been moved.
      </p>
    </div>
  );
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error: any) => {
          const status = error?.status ?? error?.response?.status;
          if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
            return false;
          }
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        staleTime: 30_000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
    defaultNotFoundComponent: DefaultNotFoundComponent,
  });

  return router;
};
