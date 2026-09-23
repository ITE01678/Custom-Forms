import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { archiveForm, deleteForm, getFormById, publishForm, saveDraft } from "../../services/forms";
import { listConnectorConfigs } from "../../services/connectorConfigs";
import { useFormBuilderStore } from "../../hooks/useFormBuilderStore";
import { SectionEditor } from "../../components/builder/SectionEditor";
import { BrandingPanel } from "../../components/builder/BrandingPanel";
import { SharingPanel } from "../../components/builder/SharingPanel";
import { EditPolicyPanel } from "../../components/builder/EditPolicyPanel";
import { FormSettingsPanel } from "../../components/builder/FormSettingsPanel";
import { RoutingPanel } from "../../components/builder/RoutingPanel";
import { BranchingPanel } from "../../components/builder/BranchingPanel";
import { PreviewModal } from "../../components/builder/PreviewModal";
import { FormFilesPanel } from "../../components/builder/FormFilesPanel";
import { RichTextEditor } from "../../components/builder/RichTextEditor";
import { TextStyleControls } from "../../components/builder/TextStyleControls";
import { AppTopbar } from "../../components/layout/AppTopbar";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { textStyleToCss } from "../../lib/textStyle";
import type { ConnectorOption } from "../../components/builder/FieldEditor";

type Tab = "content" | "branching" | "branding" | "sharing" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "content", label: "Content" },
  { id: "branching", label: "Branching" },
  { id: "branding", label: "Branding" },
  { id: "sharing", label: "Sharing" },
  { id: "settings", label: "Settings" },
];

export function BuilderPage() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const { stored, isDirty, isSaving, isPublishing, load, markSaved, setSaving, setPublishing, updateForm, addSection } =
    useFormBuilderStore();

  const [tab, setTab] = useState<Tab>("content");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [connectorOptions, setConnectorOptions] = useState<ConnectorOption[]>([]);
  const [isArchiving, setIsArchiving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!formId) return;
    let cancelled = false;
    getFormById(formId)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setLoadError("Form not found.");
          return;
        }
        load(result);
      })
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : String(err)));
    listConnectorConfigs()
      .then((configs) => {
        if (!cancelled) {
          setConnectorOptions(configs.map((c) => ({ id: c.id, name: c.fields.Name, type: c.fields.ConnectorType })));
        }
      })
      .catch(() => {}); // non-fatal — connector-autofill fields just show "none configured yet"
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId]);

  if (loadError) return <div className="page">{loadError}</div>;
  if (!stored) return <div className="page">Loading…</div>;

  const { form } = stored;
  const sortedSections = [...form.sections].sort((a, b) => a.order - b.order);

  async function handleSaveDraft() {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await saveDraft(stored!, {});
      markSaved(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    setSaveError(null);
    try {
      const base = isDirty ? await saveDraft(stored!, {}) : stored!;
      const updated = await publishForm(base);
      markSaved(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  async function handleArchive() {
    setIsArchiving(true);
    setSaveError(null);
    try {
      const updated = await archiveForm(stored!);
      markSaved(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsArchiving(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setSaveError(null);
    try {
      await deleteForm(stored!);
      navigate("/");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="app-shell">
      <AppTopbar backTo={{ to: "/", label: "My forms" }} />
      <div className="page page--wide">
      <div className="builder-header">
        <input
          className="builder-header__title"
          style={textStyleToCss(form.titleStyle)}
          value={form.title}
          onChange={(e) => updateForm({ title: e.target.value })}
        />
        <span className={`status-pill status-pill--${form.status}`}>{form.status}</span>
      </div>

      <div className="builder-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "is-active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "content" && (
        <>
          <TextStyleControls value={form.titleStyle} onChange={(titleStyle) => updateForm({ titleStyle })} />
          <RichTextEditor
            value={form.description ?? ""}
            onChange={(description) => updateForm({ description })}
            placeholder="Form description (optional)"
          />

          {sortedSections.map((section, i) => (
            <SectionEditor
              key={section.id}
              formId={form.id}
              section={section}
              isFirst={i === 0}
              isLast={i === sortedSections.length - 1}
              connectorOptions={connectorOptions}
            />
          ))}

          <button onClick={addSection}>+ Add section</button>
        </>
      )}

      {tab === "branching" && <BranchingPanel form={form} />}
      {tab === "branding" && <BrandingPanel form={form} />}
      {tab === "sharing" && <SharingPanel form={form} />}
      {tab === "settings" && (
        <>
          <FormSettingsPanel form={form} />
          <EditPolicyPanel form={form} />
          <RoutingPanel form={form} />
        </>
      )}

      <div className="builder-actions">
        <button onClick={() => setShowPreview(true)}>Preview</button>
        <button onClick={handleSaveDraft} disabled={isSaving || !isDirty}>
          {isSaving ? "Saving…" : "Save draft"}
        </button>
        <button className="btn-primary" onClick={handlePublish} disabled={isPublishing || sortedSections.length === 0}>
          {isPublishing ? "Publishing…" : "Publish"}
        </button>
        {form.status !== "archived" && (
          <button onClick={handleArchive} disabled={isArchiving}>
            {isArchiving ? "Archiving…" : "Archive"}
          </button>
        )}
        <button className="btn-danger" onClick={() => setShowDeleteConfirm(true)} disabled={isDeleting}>
          Delete
        </button>
        {saveError && <span className="error-text">{saveError}</span>}
      </div>

      <p className="builder-owner">Owner: {form.owner.upn}</p>

      <FormFilesPanel form={form} />

      {showPreview && <PreviewModal form={form} onClose={() => setShowPreview(false)} />}

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete this form?"
          message={
            `This permanently deletes "${form.title}", its response workbook, published snapshots, and sync ` +
            "queue entries. Only allowed when it has zero responses — if it has any, you'll be asked to archive " +
            "it instead. This can't be undone."
          }
          confirmLabel="Delete permanently"
          danger
          busy={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      </div>
    </div>
  );
}
