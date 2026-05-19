export type EditablePhase = {
  name?: string;
  isInbox: boolean;
};

export function canEditPhaseName(phase: EditablePhase): boolean {
  return !phase.isInbox;
}

export type PhaseEditAction = {
  label: string;
  ariaLabel: string;
  title: string;
};

export function getPhaseEditAction(phase: EditablePhase): PhaseEditAction | null {
  if (!canEditPhaseName(phase)) return null;

  const name = phase.name?.trim() || "category";
  return {
    label: "Edit",
    ariaLabel: `Edit ${name}`,
    title: `Edit ${name}`,
  };
}
