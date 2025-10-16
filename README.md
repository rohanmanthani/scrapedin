# LinkedIn Automation Workbench

Local-first toolkit for designing and running LinkedIn Sales Navigator automations without shipping sensitive data off-box. The project exposes an Express + Playwright backend and a React frontend that help you draft automations, queue jobs safely, and collect leads into exportable lists.

> ⚠️ **Risk disclaimer**: Scraping or automating LinkedIn can violate their Terms of Service and may result in account restrictions. Use this project at your own risk, keep workloads light, and monitor activity regularly.

## Key Capabilities

- **Automations home**: Draft new scraping tasks from the Automations page by describing an ICP, providing company URLs, or supplying post URLs. Every task is created in `draft` state so you can adjust filters before execution, then queued once you are ready.
- **Rich Sales Navigator filters**: The preset editor now mirrors the fields available in Sales Navigator (keywords, geography, company HQ, seniority, buyer intent toggles, TeamLink paths, etc.).
- **Task taxonomy**: Tasks are typed (`sales_navigator`, `account_followers`, `post_engagement`) so we can plug in bespoke scrapers per workflow while re-using the same scheduler UI.
- **Safety guardrails**: Quiet hours, daily search/lead caps, random delays, and headless/visible toggles remain configurable under Settings.
- **Local persistence**: Everything (settings, presets, tasks, leads) lives inside `data/app-state.json`. Back it up or wipe it to reset state.

## Project Layout

```
backend/   Express API, state repository, Playwright client, automation controller
frontend/  React UI (Vite + React Query), automation dashboard and lead viewer
scripts/   Miscellaneous helper scripts
configs/   Drop-in config files (e.g., Playwright launch tuning)
data/      Local JSON datastore (auto-created)
```

### Backend Highlights

- `SearchTaskService` normalises legacy tasks and supports the new task types. ICP instructions are stored in `payload.icpPrompt` for regenerated presets.
- `LinkedInNavigatorClient` constructs Sales Navigator URLs with the expanded filter set.
- `AutomationController` now dispatches Sales Navigator searches, account follower scrapes, and post engagement scrapes through dedicated Playwright clients.
- New routes:
  - `POST /api/tasks/accounts` – create follower-scraping drafts from company URLs.
  - `POST /api/tasks/posts` – create engagement-scraping drafts from post URLs.

### Frontend Highlights

- Automations page shows task type badges, quick detail summaries, and an `Add New` dropdown for ICP/Accounts/Posts flows.
- Creation modals validate input (e.g., list parsing, engagement toggle checks).
- Success banners give lightweight feedback after a job is drafted.

## Prerequisites

- Node.js 18+
- npm 9+
- (optional) Chrome/Chromium for Playwright with Sales Navigator access.

Install dependencies:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
npx --yes playwright install chromium
```

## Configuring Credentials

Open the **Settings** page and provide at least one of the following:

- `Chrome user data directory` – reuse a logged-in profile.
- `LinkedIn session cookie (li_at)` – paste the value manually or click *Fetch LinkedIn Cookie* to let Playwright capture it.
- Optional: point to a Chrome executable and supply an OpenAI API key (used for ICP to preset generation).

All secrets stay locally on disk inside `data/app-state.json`.

## Running Locally

```bash
npm run dev:backend    # starts Express API on :4000 by default
npm run dev:frontend   # starts Vite dev server on :5173
```

Visit `http://localhost:5173` and work through the Settings → Automations flow.

## Automations 101

1. Head to **Automations**.
2. Click **Add New** and choose one of:
   - **Create by ICP** – freeform text prompt that OpenAI converts into presets + draft tasks.
   - **Create by Accounts** – comma/newline separated company URLs. Draft task feeds the follower scraper when started.
   - **Create by Posts** – comma/newline separated post URLs with checkboxes for reactions/commenters.
3. Review the draft row, open the overflow menu, and (for Sales Navigator jobs) edit filters before starting.
4. Start or pause jobs directly from the Automations table once you are satisfied with the configuration; the first manual start auto-arms the background runner (even during quiet hours) so you don't have to toggle it separately.

## Leads View

Captured leads land in **Leads** where you can filter, inspect, and export. Sales Navigator, account follower, and post engagement jobs all push into this table with automatic deduplication.

## Known Gaps & Next Steps

1. **Scheduler execution**
   - Optionally expose scheduling UI (run later, recurring runs).
   - Track per-run metrics (duration, error) for better observability.
2. **Lead list management**
   - CRUD for named lead lists inside the UI.
   - Bulk actions (assign to list, export subset).
3. **Safety & reliability**
   - Add retry/backoff strategies specific to follower/commenter scrapes.
   - Detect login prompts/captcha events and surface high-visibility alerts.
   - Harden selectors (fallbacks, telemetry) as LinkedIn updates the DOM.
4. **Analytics & UX polish**
   - Task run history (success/failure counts, durations).
   - Inline diff of filters when editing drafts generated by ICP.
5. **Testing**
   - Unit tests for `SearchTaskService` and reducers.
   - Playwright smoke tests for common UI flows (create task, edit filters, delete task).

Keep these TODOs mirrored in `agents.md` so future sessions can jump straight into implementation details.

## License

This repository currently has no explicit license. Treat it as proprietary/private unless a license file is added.
