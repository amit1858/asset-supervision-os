import type { ReactNode } from "react";
import { EnterprisePageHeader, SummaryStrip, type SummaryItem } from "@/components/ui/enterprise";
import { MyBrief } from "@/components/brief/MyBrief";
import { getPersona } from "@/personas/registry";
import type { PersonaBrief } from "@/brief/types";
import type { PersonaId } from "@/personas/types";

/**
 * Persona landing layout: an enterprise header, the Chief of Staff "My Brief"
 * layer, and the "My Workspace" operational depth (children). Internal
 * persona-design content (primary questions, collaborating roles, expected
 * source systems, static "decisions you own") is intentionally NOT rendered —
 * its intent is realised through the brief and workspace. Those notes live in
 * docs/PERSONAS.md.
 */
export function LandingLayout({
  personaId,
  title,
  description,
  brief,
  kpis,
  children,
}: {
  personaId: PersonaId;
  title: string;
  description?: string;
  brief?: PersonaBrief;
  kpis?: SummaryItem[];
  children: ReactNode;
}) {
  const persona = getPersona(personaId);
  return (
    <>
      <EnterprisePageHeader
        eyebrow={`${persona.displayName} · ${persona.family.replace(/_/g, " ")}`}
        title={title}
        description={description ?? persona.description}
      />
      <div className="mx-auto w-full max-w-content space-y-6 px-6 py-6">
        {brief ? <MyBrief brief={brief} /> : null}
        <section aria-label="My Workspace">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-secondary">
            My Workspace
          </h2>
          {kpis ? (
            <div className="mb-4">
              <SummaryStrip items={kpis} />
            </div>
          ) : null}
          <div className="space-y-6">{children}</div>
        </section>
      </div>
    </>
  );
}
