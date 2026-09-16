import { evaluateCondition } from "./condition";
import { shuffle } from "../lib/shuffle";
import type { FormField, FormSection } from "./types";

/**
 * Randomizes section presentation order (FormSettings.shuffleSections),
 * reassigning `order` on shallow copies — branchRules/defaultNext still
 * target specific section ids and are unaffected; only the natural
 * "next in order" fallback in resolveNextSectionId sees the new order.
 */
export function shuffleSectionOrder(sections: FormSection[]): FormSection[] {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  return shuffle(sorted).map((s, i) => ({ ...s, order: i }));
}

/** Fields visible in the given section under the current answers. */
export function getVisibleFields(section: FormSection, answers: Record<string, unknown>): FormField[] {
  return section.fields.filter((f) => !f.visibility || evaluateCondition(f.visibility, answers));
}

/** Whether a section itself should be rendered/stopped at (false = auto-skip). */
export function isSectionVisible(section: FormSection, answers: Record<string, unknown>): boolean {
  return !section.visibility || evaluateCondition(section.visibility, answers);
}

function sectionById(sections: FormSection[], id: string): FormSection | undefined {
  return sections.find((s) => s.id === id);
}

function naturalNextId(sections: FormSection[], currentId: string): string | null {
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const idx = ordered.findIndex((s) => s.id === currentId);
  return ordered[idx + 1]?.id ?? null;
}

/**
 * Resolves which section to go to after "Next" on `currentSectionId`:
 *  1. First matching branchRule's `goTo` wins.
 *  2. Else `defaultNext`.
 *  3. Else the next section in schema order.
 *  4. If the resolved target is itself hidden (visibility=false), repeat from
 *     that target's own defaultNext/natural-order — hidden sections are
 *     transparently skipped, never shown as an empty step.
 * Returns null when there's no next section (i.e. submit).
 */
export function resolveNextSectionId(
  currentSectionId: string,
  sections: FormSection[],
  answers: Record<string, unknown>
): string | null {
  let cursor: string | null = currentSectionId;
  const guard = new Set<string>(); // cycle-safety: a misconfigured form must not infinite-loop

  while (cursor) {
    if (guard.has(cursor)) return null; // detected a cycle — bail rather than hang
    guard.add(cursor);

    const current = sectionById(sections, cursor);
    if (!current) return null;

    let candidate: string | null = null;
    for (const rule of current.branchRules ?? []) {
      if (evaluateCondition(rule.when, answers)) {
        candidate = rule.goTo;
        break;
      }
    }
    candidate ??= current.defaultNext ?? naturalNextId(sections, cursor);

    if (!candidate) return null; // end of form -> submit

    const candidateSection = sectionById(sections, candidate);
    if (!candidateSection) return null;

    if (isSectionVisible(candidateSection, answers)) {
      return candidate;
    }

    // Candidate is hidden — keep resolving forward from it instead of stopping there.
    cursor = candidate;
  }

  return null;
}

/** The first section to render when starting a fresh fill-out, skipping any
 *  that are hidden under the initial (usually empty) answers. */
export function resolveFirstSectionId(sections: FormSection[], answers: Record<string, unknown>): string | null {
  const ordered = [...sections].sort((a, b) => a.order - b.order);
  const first = ordered[0];
  if (!first) return null;
  if (isSectionVisible(first, answers)) return first.id;
  return resolveNextSectionId(first.id, sections, answers);
}
