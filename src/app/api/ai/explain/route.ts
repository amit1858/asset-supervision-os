import { NextResponse } from "next/server";
import { getRepository } from "@/data/repository";
import { explainAssetRisk } from "@/ai/service";
import { ANCHOR_NOW } from "@/data/constants";
import type { EvidenceLine } from "@/ai/types";

/**
 * Server-side AI explanation endpoint.
 *
 * Demonstrates the model-portability boundary: the UI calls THIS route, the
 * route calls the server-only AI service, which selects a provider (mock by
 * default). A model is never invoked from a client component. Deterministic
 * with the mock provider, so it can be demoed offline with no API key.
 */
export async function POST(request: Request) {
  let assetTag = "K-201";
  try {
    const body = (await request.json()) as { assetTag?: string };
    if (body.assetTag) assetTag = body.assetTag;
  } catch {
    // empty body -> default hero asset
  }

  const repo = getRepository();
  const model = repo.getAsset360(assetTag);
  if (!model || !model.risk || !model.recommendation) {
    return NextResponse.json(
      { error: `No risk model for asset ${assetTag}` },
      { status: 404 },
    );
  }

  const evidence: EvidenceLine[] = model.evidence.map((e) => ({
    label: e.label,
    value: e.value,
    provenance: e.provenance,
  }));

  const result = await explainAssetRisk({
    risk: model.risk,
    evidence,
    recommendationId: model.recommendation.id,
    createdAt: ANCHOR_NOW,
  });

  return NextResponse.json({
    assetTag,
    text: result.text,
    interaction: result.interaction,
  });
}
