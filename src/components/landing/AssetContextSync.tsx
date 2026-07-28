"use client";

import { useEffect } from "react";
import { useOperationalContext } from "@/context/OperationalContext";

/**
 * Silently records the asset being viewed into the shared operational context,
 * so switching persona (e.g. Engineer → Maintenance Planner) preserves the
 * asset thread and lands in the new persona's asset-relevant view.
 */
export function AssetContextSync({ tag }: { tag: string }) {
  const { assetTag, setAsset } = useOperationalContext();
  useEffect(() => {
    if (assetTag !== tag) setAsset(tag);
  }, [assetTag, tag, setAsset]);
  return null;
}
