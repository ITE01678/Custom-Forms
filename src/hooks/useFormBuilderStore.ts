import { create } from "zustand";
import type { FieldType, FormDefinition, FormField, FormSection } from "../formsSchema/types";
import type { StoredForm } from "../services/forms";

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  shortText: "Short answer",
  longText: "Long answer",
  singleChoice: "Choice (single)",
  multiChoice: "Choice (multiple)",
  date: "Date",
  dateTime: "Date & time",
  number: "Number",
  rating: "Rating",
  fileUpload: "File upload",
  repeatingTable: "Repeating table",
};

export { FIELD_TYPE_LABELS };

function newField(type: FieldType, order: number): FormField {
  const base: FormField = {
    id: crypto.randomUUID(),
    type,
    label: FIELD_TYPE_LABELS[type],
    order,
    fillMode: "manual",
    validation: { required: false },
  };
  if (type === "singleChoice" || type === "multiChoice") {
    base.options = [
      { value: "option-1", label: "Option 1" },
      { value: "option-2", label: "Option 2" },
    ];
  }
  if (type === "repeatingTable") {
    // Always connector-sourced — a repeating table only makes sense pulled
    // from a data source (e.g. a team roster), not typed by hand.
    base.fillMode = "connector-autofill";
    base.readOnly = true;
    base.columns = [{ key: "name", label: "Name", type: "text" }];
  }
  return base;
}

function newSection(order: number): FormSection {
  return {
    id: crypto.randomUUID(),
    title: `Section ${order + 1}`,
    order,
    fields: [],
  };
}

function reorder<T extends { order: number }>(items: T[], id: string, direction: "up" | "down", idOf: (item: T) => string): T[] {
  const sorted = [...items].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((i) => idOf(i) === id);
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (idx < 0 || swapWith < 0 || swapWith >= sorted.length) return items;
  const a = sorted[idx];
  const b = sorted[swapWith];
  const aOrder = a.order;
  a.order = b.order;
  b.order = aOrder;
  return sorted;
}

interface FormBuilderState {
  stored: StoredForm | null;
  isDirty: boolean;
  isSaving: boolean;
  isPublishing: boolean;

  load: (stored: StoredForm) => void;
  markSaved: (stored: StoredForm) => void;
  setSaving: (v: boolean) => void;
  setPublishing: (v: boolean) => void;

  updateForm: (updates: Partial<FormDefinition>) => void;
  addSection: () => void;
  removeSection: (sectionId: string) => void;
  duplicateSection: (sectionId: string) => void;
  moveSection: (sectionId: string, direction: "up" | "down") => void;
  updateSection: (sectionId: string, updates: Partial<FormSection>) => void;

  addField: (sectionId: string, type: FieldType) => void;
  removeField: (sectionId: string, fieldId: string) => void;
  duplicateField: (sectionId: string, fieldId: string) => void;
  moveField: (sectionId: string, fieldId: string, direction: "up" | "down") => void;
  updateField: (sectionId: string, fieldId: string, updates: Partial<FormField>) => void;
}

export const useFormBuilderStore = create<FormBuilderState>((set) => ({
  stored: null,
  isDirty: false,
  isSaving: false,
  isPublishing: false,

  load: (stored) => set({ stored, isDirty: false }),
  markSaved: (stored) => set({ stored, isDirty: false }),
  setSaving: (v) => set({ isSaving: v }),
  setPublishing: (v) => set({ isPublishing: v }),

  updateForm: (updates) =>
    set((s) => (s.stored ? { stored: { ...s.stored, form: { ...s.stored.form, ...updates } }, isDirty: true } : s)),

  addSection: () =>
    set((s) => {
      if (!s.stored) return s;
      const sections = [...s.stored.form.sections, newSection(s.stored.form.sections.length)];
      return { stored: { ...s.stored, form: { ...s.stored.form, sections } }, isDirty: true };
    }),

  removeSection: (sectionId) =>
    set((s) => {
      if (!s.stored) return s;
      const sections = s.stored.form.sections.filter((sec) => sec.id !== sectionId);
      return { stored: { ...s.stored, form: { ...s.stored.form, sections } }, isDirty: true };
    }),

  duplicateSection: (sectionId) =>
    set((s) => {
      if (!s.stored) return s;
      const original = s.stored.form.sections.find((sec) => sec.id === sectionId);
      if (!original) return s;
      const copy: FormSection = {
        ...original,
        id: crypto.randomUUID(),
        title: `${original.title} (copy)`,
        order: s.stored.form.sections.length,
        fields: original.fields.map((f) => ({ ...f, id: crypto.randomUUID() })),
      };
      const sections = [...s.stored.form.sections, copy];
      return { stored: { ...s.stored, form: { ...s.stored.form, sections } }, isDirty: true };
    }),

  moveSection: (sectionId, direction) =>
    set((s) => {
      if (!s.stored) return s;
      const sections = reorder(s.stored.form.sections, sectionId, direction, (sec) => sec.id);
      return { stored: { ...s.stored, form: { ...s.stored.form, sections } }, isDirty: true };
    }),

  updateSection: (sectionId, updates) =>
    set((s) => {
      if (!s.stored) return s;
      const sections = s.stored.form.sections.map((sec) => (sec.id === sectionId ? { ...sec, ...updates } : sec));
      return { stored: { ...s.stored, form: { ...s.stored.form, sections } }, isDirty: true };
    }),

  addField: (sectionId, type) =>
    set((s) => {
      if (!s.stored) return s;
      const sections = s.stored.form.sections.map((sec) =>
        sec.id === sectionId ? { ...sec, fields: [...sec.fields, newField(type, sec.fields.length)] } : sec
      );
      return { stored: { ...s.stored, form: { ...s.stored.form, sections } }, isDirty: true };
    }),

  removeField: (sectionId, fieldId) =>
    set((s) => {
      if (!s.stored) return s;
      const sections = s.stored.form.sections.map((sec) =>
        sec.id === sectionId ? { ...sec, fields: sec.fields.filter((f) => f.id !== fieldId) } : sec
      );
      return { stored: { ...s.stored, form: { ...s.stored.form, sections } }, isDirty: true };
    }),

  duplicateField: (sectionId, fieldId) =>
    set((s) => {
      if (!s.stored) return s;
      const sections = s.stored.form.sections.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const original = sec.fields.find((f) => f.id === fieldId);
        if (!original) return sec;
        const copy: FormField = {
          ...original,
          id: crypto.randomUUID(),
          label: `${original.label} (copy)`,
          order: sec.fields.length,
        };
        return { ...sec, fields: [...sec.fields, copy] };
      });
      return { stored: { ...s.stored, form: { ...s.stored.form, sections } }, isDirty: true };
    }),

  moveField: (sectionId, fieldId, direction) =>
    set((s) => {
      if (!s.stored) return s;
      const sections = s.stored.form.sections.map((sec) =>
        sec.id === sectionId ? { ...sec, fields: reorder(sec.fields, fieldId, direction, (f) => f.id) } : sec
      );
      return { stored: { ...s.stored, form: { ...s.stored.form, sections } }, isDirty: true };
    }),

  updateField: (sectionId, fieldId, updates) =>
    set((s) => {
      if (!s.stored) return s;
      const sections = s.stored.form.sections.map((sec) =>
        sec.id === sectionId
          ? { ...sec, fields: sec.fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)) }
          : sec
      );
      return { stored: { ...s.stored, form: { ...s.stored.form, sections } }, isDirty: true };
    }),
}));
