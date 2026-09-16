import type { ComponentType } from "react";
import { IconBuilding, IconDollar, IconHandRaised, IconBriefcase } from "../common/Icons";
import type { Persona } from "../../lib/types";

/** Shared between WorkspaceSelectView and LoginView's quick-access row —
 * one icon/tone per persona, defined once so the two screens can't drift
 * into showing a different mark for the same workspace. */
export const PERSONA_ICON: Record<Persona, ComponentType<{ className?: string }>> = {
  command: IconBuilding,
  insurance: IconDollar,
  field: IconHandRaised,
  executive: IconBriefcase,
};

export const PERSONA_TONE: Record<Persona, string> = {
  command: "from-[#3987e5]/25 to-[#3987e5]/5 text-[#6fa8f0]",
  insurance: "from-primary/25 to-primary/5 text-primary",
  field: "from-[#d03b3b]/25 to-[#d03b3b]/5 text-[#ff8a8a]",
  executive: "from-intel-violet/25 to-intel-violet/5 text-intel-violet",
};
