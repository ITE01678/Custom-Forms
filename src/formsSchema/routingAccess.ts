import type { FormDefinition } from "./types";

export interface SectionAccess {
  /** Sections shown at all (read-only unless also in editableSectionIds). */
  visibleSectionIds: Set<string>;
  /** Sections this actor can actually fill in. */
  editableSectionIds: Set<string>;
  /** True when there's no restriction at all for this stage — everything
   *  visible and editable, matching every form that existed before
   *  per-stage section access did. */
  unrestricted: boolean;
}

function allSectionIds(form: FormDefinition): Set<string> {
  return new Set(form.sections.map((s) => s.id));
}

/** A section nobody explicitly assigned to any stage (not in
 *  `initialSectionIds` or any step's `editableSectionIds`) is treated as a
 *  shared/common section, visible and editable at every stage — otherwise
 *  forgetting to assign a section would silently make it permanently
 *  unreachable, which is a much worse failure mode than "too visible." */
function unassignedSectionIds(form: FormDefinition): Set<string> {
  const mentioned = new Set<string>(form.routing?.initialSectionIds ?? []);
  for (const step of form.routing?.steps ?? []) {
    for (const id of step.editableSectionIds ?? []) mentioned.add(id);
  }
  const unassigned = new Set<string>();
  for (const section of form.sections) {
    if (!mentioned.has(section.id)) unassigned.add(section.id);
  }
  return unassigned;
}

/** Section access for the ORIGINAL respondent, before any routing starts —
 *  e.g. "the first person only fills Part A." */
export function initialSectionAccess(form: FormDefinition): SectionAccess {
  const restricted = form.routing?.initialSectionIds;
  if (!restricted || restricted.length === 0) {
    const all = allSectionIds(form);
    return { visibleSectionIds: all, editableSectionIds: all, unrestricted: true };
  }
  const unassigned = unassignedSectionIds(form);
  const ids = new Set([...restricted, ...unassigned]);
  return { visibleSectionIds: ids, editableSectionIds: ids, unrestricted: false };
}

/**
 * Section access for the approver at routing step `stepIndex` (0-based,
 * into form.routing.steps). Visible = every section reachable by this
 * point in the chain (the initial fill's sections, plus every earlier
 * step's, plus this step's own) — so an approver always has full context
 * on what came before, even for sections they personally can't edit this
 * round. Editable = just this step's own list (or everything, if this step
 * has no restriction configured).
 */
export function stepSectionAccess(form: FormDefinition, stepIndex: number): SectionAccess {
  const steps = form.routing?.steps ?? [];
  const currentStep = steps[stepIndex];
  const currentRestricted = currentStep?.editableSectionIds;
  const unassigned = unassignedSectionIds(form);

  if (!currentStep || !currentRestricted || currentRestricted.length === 0) {
    const all = allSectionIds(form);
    return { visibleSectionIds: all, editableSectionIds: all, unrestricted: true };
  }

  // Matches initialSectionAccess's own "empty array = no restriction"
  // contract (and the builder's own instructions to designers) — `??` alone
  // only catches null/undefined, not [], so an intentionally-unrestricted
  // initial fill (initialSectionIds: []) was silently seeding `visible` as
  // EMPTY instead of "every section", making every section the respondent
  // filled but nobody explicitly assigned invisible to the first approver.
  const initialIds = form.routing?.initialSectionIds;
  const visible = new Set<string>(!initialIds || initialIds.length === 0 ? allSectionIds(form) : initialIds);
  for (let i = 0; i <= stepIndex; i++) {
    const ids = steps[i]?.editableSectionIds;
    if (ids && ids.length > 0) {
      ids.forEach((id) => visible.add(id));
    } else {
      // an earlier unrestricted step implies "saw everything" too
      allSectionIds(form).forEach((id) => visible.add(id));
    }
  }
  unassigned.forEach((id) => visible.add(id));

  const editable = new Set([...currentRestricted, ...unassigned]);
  return { visibleSectionIds: visible, editableSectionIds: editable, unrestricted: false };
}
