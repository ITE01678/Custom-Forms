import type { FieldType, FormSection } from "../../formsSchema/types";
import { FIELD_TYPE_LABELS, useFormBuilderStore } from "../../hooks/useFormBuilderStore";
import { FieldEditor, type ConnectorOption } from "./FieldEditor";
import { MediaUploadField } from "./MediaUploadField";

interface Props {
  formId: string;
  section: FormSection;
  isFirst: boolean;
  isLast: boolean;
  connectorOptions: ConnectorOption[];
}

const ADDABLE_FIELD_TYPES: FieldType[] = [
  "shortText",
  "longText",
  "email",
  "approverEmail",
  "singleChoice",
  "multiChoice",
  "date",
  "dateTime",
  "number",
  "rating",
  "fileUpload",
  "repeatingTable",
];

export function SectionEditor({ formId, section, isFirst, isLast, connectorOptions }: Props) {
  const { updateSection, removeSection, duplicateSection, moveSection, addField } = useFormBuilderStore();
  const sortedFields = [...section.fields].sort((a, b) => a.order - b.order);

  return (
    <div className="section-editor">
      <div className="section-editor__header">
        <input
          className="section-editor__title"
          value={section.title}
          onChange={(e) => updateSection(section.id, { title: e.target.value })}
        />
        <button onClick={() => duplicateSection(section.id)} title="Duplicate section">
          ⧉
        </button>
        <button onClick={() => moveSection(section.id, "up")} disabled={isFirst} title="Move section up">
          ↑
        </button>
        <button onClick={() => moveSection(section.id, "down")} disabled={isLast} title="Move section down">
          ↓
        </button>
        <button onClick={() => removeSection(section.id)} title="Remove section">
          Remove section
        </button>
      </div>

      <div className="section-editor__meta">
        <input
          value={section.description ?? ""}
          onChange={(e) => updateSection(section.id, { description: e.target.value })}
          placeholder="Section description (optional)"
        />
        <MediaUploadField
          formId={formId}
          kind={`section-${section.id}`}
          label="Section image (optional)"
          value={section.imageUrl}
          onChange={(url) => updateSection(section.id, { imageUrl: url })}
        />
      </div>

      <div className="section-editor__fields">
        {sortedFields.map((field, i) => (
          <FieldEditor
            key={field.id}
            formId={formId}
            sectionId={section.id}
            field={field}
            isFirst={i === 0}
            isLast={i === sortedFields.length - 1}
            connectorOptions={connectorOptions}
          />
        ))}
      </div>

      <div className="section-editor__add-field">
        {ADDABLE_FIELD_TYPES.map((type) => (
          <button key={type} onClick={() => addField(section.id, type)}>
            + {FIELD_TYPE_LABELS[type]}
          </button>
        ))}
      </div>
    </div>
  );
}
