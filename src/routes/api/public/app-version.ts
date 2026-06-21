import { createFileRoute } from "@tanstack/react-router";
import { APP_BUILD_VERSION } from "@/lib/app-version";

export const Route = createFileRoute("/api/public/app-version")({
  server: {
    handlers: {
      GET: async () => {
        return Response.json(
          {
            version: APP_BUILD_VERSION,
            generatedAt: new Date().toISOString(),
          },
          {
            headers: {
              "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
              Pragma: "no-cache",
              Expires: "0",
            },
          },
        );
      },
    },
  },
});
