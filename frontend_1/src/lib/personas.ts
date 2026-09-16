import type { Persona } from "./types";

/** Shared persona metadata — the workspace-selection screen, the top-bar
 * workspace switcher, and the login screen's quick-access row all render
 * from this one list, so a new persona (or a relabel) only needs to
 * change in one place. */
export interface PersonaMeta {
  id: Persona;
  label: string;
  org: string;
  description: string;
  /** Demo-only identity for the login screen's quick-access buttons —
   * there is no user directory behind this app (see App.tsx's onSignIn),
   * so this is a role title and a clearly-fake @lifeshield.demo address,
   * never a real person or a real organization's domain. */
  demoName: string;
  demoEmail: string;
}

export const PERSONA_META: PersonaMeta[] = [
  {
    id: "command",
    label: "Government",
    org: "Emergency Command",
    description: "Public safety, evacuation, and infrastructure — the situation, its severity, what to do next.",
    demoName: "Duty Officer",
    demoEmail: "duty.officer@lifeshield.demo",
  },
  {
    id: "insurance",
    label: "Insurance",
    org: "Portfolio & Claims",
    description: "Catastrophe exposure, estimated loss, and the policies driving it.",
    demoName: "Underwriter",
    demoEmail: "underwriter@lifeshield.demo",
  },
  {
    id: "field",
    label: "Emergency Response",
    org: "Field Operations",
    description: "One instruction and a route — the guided flow this workspace was built for.",
    demoName: "Field Responder",
    demoEmail: "field.responder@lifeshield.demo",
  },
  {
    id: "executive",
    label: "Executive",
    org: "Leadership Briefing",
    description: "A four-sentence briefing and the decision it's asking of you — read-only.",
    demoName: "Executive Reader",
    demoEmail: "executive@lifeshield.demo",
  },
];
