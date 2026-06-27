# Zenwork QA

## End-to-end tests (Playwright)

The Playwright suite under `e2e/` logs in as both an Admin and a QA Agent,
crawls every authenticated route, and asserts that no realtime status text
or toast surfaces in the UI while the Supabase realtime channel stays
subscribed. Specs auto-skip when credentials are missing.

### Required environment variables

| Variable                    | Purpose                                |
| --------------------------- | -------------------------------------- |
| `PLAYWRIGHT_ADMIN_EMAIL`    | Email of an existing Admin account     |
| `PLAYWRIGHT_ADMIN_PASSWORD` | Password for the Admin account         |
| `PLAYWRIGHT_AGENT_EMAIL`    | Email of an existing QA Agent account  |
| `PLAYWRIGHT_AGENT_PASSWORD` | Password for the QA Agent account      |
| `PLAYWRIGHT_BASE_URL`       | Optional — defaults to the preview URL |

Both accounts must already exist in the target environment with their
respective roles (`admin` and `agent`).

### Running the suite

```bash
# Run all e2e tests
PLAYWRIGHT_ADMIN_EMAIL=admin@example.com \
PLAYWRIGHT_ADMIN_PASSWORD=••• \
PLAYWRIGHT_AGENT_EMAIL=agent@example.com \
PLAYWRIGHT_AGENT_PASSWORD=••• \
bun run e2e
```

### Generating / updating visual snapshots

The post-login spec captures per-route screenshots of the header and the
sonner toaster region. Baselines live next to the spec under
`e2e/post-login-no-realtime-ui.spec.ts-snapshots/`.

On the first run (or after an intentional visual change), regenerate the
baselines:

```bash
PLAYWRIGHT_ADMIN_EMAIL=… PLAYWRIGHT_ADMIN_PASSWORD=… \
PLAYWRIGHT_AGENT_EMAIL=… PLAYWRIGHT_AGENT_PASSWORD=… \
bun run e2e:update
```

Commit the generated snapshot files so subsequent CI runs diff against them.
