// omnis-ui/app/readiness/page.tsx
// Permanent redirect → /dashboard/readiness
//
// The Compliance Matrix was relocated under the /dashboard route group so it
// inherits the DashboardShell (persistent sidebar + auth gate). This stub
// redirects any bookmarks or old links to the canonical URL.

import { redirect } from "next/navigation";

export default function ReadinessRedirectPage() {
  redirect("/dashboard/readiness");
}
