import { redirect } from "next/navigation";

/**
 * Moved into the Agent Control Tower "Value & Cost" tab. Preserved as a redirect
 * so bookmarked deep links keep working (middleware also covers this).
 */
export default function AiEconomicsRedirect() {
  redirect("/agent-control?tab=value-cost");
}
