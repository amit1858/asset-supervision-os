"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Icon } from "@/components/layout/icons";
import { useOperationalContext } from "@/context/OperationalContext";

/**
 * Shows that an asset thread was carried into this workspace (e.g. from Asset
 * 360 → Planning) and syncs it into the shared context so the context bar shows
 * the active asset. Preserves the operational thread across persona switches.
 */
export function AssetThreadNotice({ tag, name }: { tag: string; name: string }) {
  const { assetTag, setAsset } = useOperationalContext();

  useEffect(() => {
    if (assetTag !== tag) setAsset(tag);
  }, [assetTag, tag, setAsset]);

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-brand bg-brand-subtle px-3 py-2">
      <span className="inline-flex items-center gap-2 text-sm text-brand-text">
        <Icon name="asset" size={15} />
        Continuing thread: <span className="equipment-id">{tag}</span>
        <span className="text-text-secondary">— {name}</span>
      </span>
      <Link href={`/assets/${tag}`} className="text-xs font-medium text-brand-text hover:underline">
        Open Asset 360 →
      </Link>
    </div>
  );
}
