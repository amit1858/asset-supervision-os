import { readOperationalContext } from "@/context/server";
import { buildPersonaBrief } from "@/brief/service";
import { getPersona } from "@/personas/registry";
import { EnterprisePageHeader } from "@/components/ui/enterprise";
import { MyBrief } from "@/components/brief/MyBrief";
import { V2Shell } from "./V2Shell";
import { OperationalThread } from "./OperationalThread";
import { V2Placeholder } from "./V2Placeholder";
import { V2Restricted } from "./V2Restricted";
import { ReliabilityWorkspace } from "./reliability/ReliabilityWorkspace";
import { getReliabilityWorkspaceView } from "@/v2/server/reliability/reliability-workspace-view";
import { getV2Route } from "@/v2/routes";
import { canAccessV2Route } from "@/v2/access";
import { v2LandingRoute } from "@/v2/nav";

/**
 * The composed Phase 1 screen for a V2 route (server).
 *
 * It wires the shell, the capability guard, the enterprise header, the operational
 * thread seam, and — for persona homes — the real Chief of Staff brief (the
 * assistant seam) around an honest Phase 2 placeholder. All content is derived
 * from the registry, the shared context, and the existing brief service; nothing
 * is fabricated. Access is decided by the capability model against the VIEWING
 * persona, so a persona switch changes the view but never grants authority.
 */
export function V2RouteScreen({ routeKey }: { routeKey: string }) {
  const route = getV2Route(routeKey);
  if (!route) return null;

  const ctx = readOperationalContext();
  const backHref = v2LandingRoute(ctx.personaId, { assetTag: ctx.assetTag });

  if (!canAccessV2Route(ctx.personaId, route.key)) {
    return (
      <V2Shell crumbs={[{ label: "V2", href: "/v2" }, { label: route.title }]}>
        <V2Restricted route={route} backHref={backHref} />
      </V2Shell>
    );
  }

  const owner = getPersona(route.ownerPersona);
  const isPersonaHome = route.kind === "persona_workspace";
  const brief = isPersonaHome
    ? buildPersonaBrief(route.ownerPersona, { assetTag: ctx.assetTag })
    : null;

  return (
    <V2Shell crumbs={[{ label: "V2", href: "/v2" }, { label: route.title }]}>
      <EnterprisePageHeader
        eyebrow={`${owner.displayName} · ${owner.family.replace(/_/g, " ")}`}
        title={route.title}
        description={route.purpose}
      />
      <div className="mx-auto w-full max-w-content space-y-6 px-6 py-6">
        {brief ? <MyBrief brief={brief} /> : null}
        <OperationalThread />
        {route.key === "reliability" ? (
          <ReliabilityWorkspace view={getReliabilityWorkspaceView(ctx.personaId)} />
        ) : (
          <V2Placeholder route={route} />
        )}
      </div>
    </V2Shell>
  );
}
