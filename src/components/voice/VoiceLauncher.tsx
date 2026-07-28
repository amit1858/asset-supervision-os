"use client";

import { useVoice } from "@/voice/VoiceContext";
import { Icon } from "@/components/layout/icons";

/** Global header action — opens the voice panel in its ready state. */
export function VoiceHeaderButton() {
  const { open } = useVoice();
  return (
    <button
      type="button"
      aria-label="Ask Asset Supervision OS"
      title="Ask Asset Supervision OS"
      onClick={() => open()}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-header-fg hover:bg-[var(--color-header-control)]"
    >
      <Icon name="voice" size={18} />
    </button>
  );
}

/** Contextual action inside My Brief — opens the panel to discuss the brief. */
export function DiscussBriefButton() {
  const { open } = useVoice();
  return (
    <button
      type="button"
      onClick={() => open("Give me my update")}
      className="inline-flex items-center gap-1.5 rounded border border-border-strong px-2 py-1 text-xs font-medium text-text-secondary hover:bg-elevated hover:text-text-primary"
    >
      <Icon name="voice" size={13} />
      Discuss brief
    </button>
  );
}
