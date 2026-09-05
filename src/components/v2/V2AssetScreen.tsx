import { notFound } from "next/navigation";
import { readOperationalContext } from "@/context/server";
import { getRepository } from "@/data/repository";
import { getPersona } from "@/personas/registry";
import { EnterprisePageHeader } from "@/components/ui/enterprise";
import {
  AssetStatusBadge,
  CriticalityBadge,
  EquipmentId,
} from "@/components/ui/Badge";
import { AssetContextSync } from "@/components/landing/AssetContextSync";
import { V2Shell } from "./V2Shell";
import { OperationalThread } from "./OperationalThread";
import { V2Placeholder } from "./V2Placeholder";
import { V2Restricted } from "./V2Restricted";
import { AssetReliabilityExperience } from "./reliability/AssetReliabilityExperience";
import { K201CasePanel } from "./agent/K201CasePanel";
import {
  getK201ReliabilityView,
  K201_TAG,
} from "@/v2/server/reliability/asset-reliability-view";
import { getV2Route } from "@/v2/routes";
import { canAccessV2Route } from "@/v2/access";
import { v2LandingRoute } from "@/v2/nav";

/**
 * Asset 360 screen (server) — the canonical asset record surface for V2. Phase 1
 * delivers the identity header, the asset-scoped operational thread, and honest
 * Phase 2 scope. The asset is loaded from the existing repository (no fabricated
 * identity), the URL tag is synced into the shared context so the thread survives
 * persona switches, and access is guarded by the capability model.
 */
export function V2AssetScreen({ tag: rawTag }: { tag: string }) {
  const route = getV2Route("asset-360");
  if (!route) return null;

  const tag = decodeURIComponent(rawTag);
  const model = getRepository().getAsset360(tag);
  if (!model) notFound();

  const ctx = readOperationalContext();
  const backHref = v2LandingRoute(ctx.personaId, { assetTag: tag });

  if (!canAccessV2Route(ctx.personaId, route.key)) {
    return (
      <V2Shell crumbs={[{ label: "V2", href: "/v2" }, { label: "Asset 360" }]}>
        <V2Restricted route={route} backHref={backHref} />
      </V2Shell>
    );
  }

  const { asset } = model;
  const owner = getPersona(route.ownerPersona);

  return (
    <V2Shell
      crumbs={[
        { label: "V2", href: "/v2" },
        { label: "Assets" },
        { label: asset.tag },
      ]}
    >
      <AssetContextSync tag={asset.tag} />
      <EnterprisePageHeader
        eyebrow={`Asset record · ${owner.family.replace(/_/g, " ")}`}
        title={
          <span className="inline-flex items-center gap-2">
            <EquipmentId tag={asset.tag} />
            <span className="text-text-secondary">{asset.name}</span>
          </span>
        }
        description={route.purpose}
        meta={
          <span className="inline-flex items-center gap-2">
            <CriticalityBadge level={asset.criticality} size="sm" />
            <AssetStatusBadge status={asset.operationalStatus} size="sm" />
          </span>
        }
      />
      <div className="mx-auto w-full max-w-content space-y-6 px-6 py-6">
        <OperationalThread assetTag={asset.tag} />
        {asset.tag === K201_TAG ? (
          <>
            <AssetReliabilityExperience view={getK201ReliabilityView(ctx.personaId)} />
            <K201CasePanel />
          </>
        ) : (
          <V2Placeholder route={route} />
        )}
      </div>
    </V2Shell>
  );
}
