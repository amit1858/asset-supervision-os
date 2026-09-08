import { readOperationalContext } from "@/context/server";
import { buildPersonaBrief } from "@/brief/service";
import { presentBriefForV2 } from "@/v2/server/brief/present-brief-v2";
import { getPersona } from "@/personas/registry";
import type { PersonaId } from "@/personas/types";
import type { ReactNode } from "react";
import { EnterprisePageHeader } from "@/components/ui/enterprise";
import { MyBrief } from "@/components/brief/MyBrief";
import { V2Shell } from "./V2Shell";
import { OperationalThread } from "./OperationalThread";
import { V2Placeholder } from "./V2Placeholder";
import { V2Restricted } from "./V2Restricted";
import { ReliabilityWorkspace } from "./reliability/ReliabilityWorkspace";
import { getReliabilityWorkspaceView } from "@/v2/server/reliability/reliability-workspace-view";
import { MaintenanceMaterialsWorkspace } from "./materials/MaintenanceMaterialsWorkspace";
import { getMaintenanceMaterialsView } from "@/v2/server/materials/maintenance-materials-view";
import { TurnaroundControlWorkspace } from "./turnaround/TurnaroundControlWorkspace";
import { getTurnaroundControlView } from "@/v2/server/turnaround/turnaround-control-view";
import { OeeLossWorkspace } from "./oee/OeeLossWorkspace";
import { getOeeLossView } from "@/v2/server/oee/oee-loss-view";
import { ValueRealisationWorkspace } from "./value/ValueRealisationWorkspace";
import { getValueRealisationView } from "@/v2/server/value/value-realisation-view";
import { getV2Route, type V2Route } from "@/v2/routes";
import { canAccessV2Route } from "@/v2/access";
import { v2LandingRoute } from "@/v2/nav";
import { AssetRiskPortfolioWorkspace } from "./portfolio/AssetRiskPortfolioWorkspace";

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
    ? presentBriefForV2(buildPersonaBrief(route.ownerPersona, { assetTag: ctx.assetTag }))
    : null;

  return (
    <V2Shell crumbs={[{ label: "V2", href: "/v2" }, { label: route.title }]}>
      <div data-journey-target="v2-page-header">
        <EnterprisePageHeader
          eyebrow={`${owner.displayName} · ${owner.family.replace(/_/g, " ")}`}
          title={route.title}
          description={route.purpose}
        />
      </div>
      <div className="mx-auto w-full max-w-content space-y-6 px-6 py-6">
        {brief ? <div data-journey-target="v2-brief"><MyBrief brief={brief} variant="v2" /></div> : null}
        <OperationalThread />
        {renderWorkspace(route, ctx.personaId)}
      </div>
    </V2Shell>
  );
}

/**
 * Resolve the workspace body for a route. A readable map from route key to its
 * server read model + presentational workspace — each branch composes an
 * existing server read model and renders its pure component; unimplemented
 * routes fall through to the honest placeholder.
 */
function renderWorkspace(route: V2Route, viewerId: PersonaId): ReactNode {
  switch (route.key) {
    case "reliability":
      return <ReliabilityWorkspace view={getReliabilityWorkspaceView(viewerId)} />;
    case "materials":
      return <MaintenanceMaterialsWorkspace view={getMaintenanceMaterialsView(viewerId)} />;
    case "turnaround":
      return <TurnaroundControlWorkspace view={getTurnaroundControlView(viewerId)} />;
    case "oee":
      return <OeeLossWorkspace view={getOeeLossView(viewerId)} />;
    case "value-realisation":
      return <ValueRealisationWorkspace view={getValueRealisationView(viewerId)} />;
    case "portfolio":
      return <AssetRiskPortfolioWorkspace />;
    default:
      return <V2Placeholder route={route} />;
  }
}
