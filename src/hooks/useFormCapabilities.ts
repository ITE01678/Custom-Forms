import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/useAuth";
import { useSiteCapabilities } from "../auth/CapabilityProvider";
import { getFormCollaborators } from "../services/formPermissions";
import { resolveFormCapabilities, type FormCapabilities } from "../formsSchema/capabilities";
import type { FormCollaborator } from "../formsSchema/types";

interface UseFormCapabilitiesResult {
  /** True until both the site role AND this form's collaborator list have
   *  resolved. Pages should show a loading state rather than rendering
   *  "not authorized" or the real content prematurely. */
  loading: boolean;
  /** null while loading or if no form/email is available yet. */
  capabilities: FormCapabilities | null;
}

/** Combines site-wide role with this specific form's FormPermissions grants.
 *  `ownerUpn` is passed separately (not the whole form) so callers that only
 *  have the owner field handy (or want to avoid re-rendering on unrelated
 *  form-object identity changes) don't need a full FormDefinition. */
export function useFormCapabilities(formId: string | undefined, ownerUpn: string | undefined): UseFormCapabilitiesResult {
  const { email } = useAuth();
  const { capabilities: site, loading: siteLoading } = useSiteCapabilities();
  const [collaborators, setCollaborators] = useState<FormCollaborator[] | null>(null);

  useEffect(() => {
    if (!formId) {
      setCollaborators(null);
      return;
    }
    let cancelled = false;
    setCollaborators(null);
    getFormCollaborators(formId)
      .then((c) => {
        if (!cancelled) setCollaborators(c);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn("[useFormCapabilities] could not load collaborators — defaulting to none", err);
        if (!cancelled) setCollaborators([]);
      });
    return () => {
      cancelled = true;
    };
  }, [formId]);

  const loading = siteLoading || !formId || !ownerUpn || !email || collaborators === null;

  const capabilities = useMemo<FormCapabilities | null>(() => {
    if (loading || !ownerUpn || !email || collaborators === null) return null;
    return resolveFormCapabilities({ site, email, ownerUpn, collaborators });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, site, email, ownerUpn, collaborators]);

  return { loading, capabilities };
}
