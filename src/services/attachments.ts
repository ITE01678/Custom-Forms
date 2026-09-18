import { graphFetch, graphUploadBinary } from "./graphClient";
import { resolveDriveIdByLibraryName } from "./sites";
import { LIBRARY_NAMES } from "./bootstrap";
import { graphScopes } from "../auth/msalConfig";
import { encodeGraphImageRef } from "../lib/graphImageRef";
import type { FileAttachment } from "../formsSchema/types";

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|#%]/g, "_");
}

/** File path within the Attachments library — one folder per response, one
 *  subfolder per field, so a response's files are all found in one place. */
function attachmentPath(formId: string, responseId: string, fieldId: string, filename: string): string {
  return `${formId}/${responseId}/${fieldId}/${sanitizeFilename(filename)}`;
}

interface DriveItemUploadResult {
  webUrl: string;
  size: number;
}

/**
 * Uploads one file to the "Attachments" SharePoint library and returns the
 * reference stored in the response's answers (never the raw bytes — those
 * live only in SharePoint). Simple PUT upload, which Graph supports up to
 * 250MB; larger files would need an upload session, not implemented here.
 */
export async function uploadAttachment(
  formId: string,
  responseId: string,
  fieldId: string,
  file: File
): Promise<FileAttachment> {
  const driveId = await resolveDriveIdByLibraryName(LIBRARY_NAMES.attachments);
  const path = attachmentPath(formId, responseId, fieldId, file.name);
  const bytes = await file.arrayBuffer();

  const result = await graphUploadBinary<DriveItemUploadResult>(`/drives/${driveId}/root:/${path}:/content`, bytes, {
    contentType: file.type || "application/octet-stream",
    scopes: graphScopes.sites,
  });

  return { name: file.name, url: result.webUrl, size: result.size };
}

export async function deleteAttachment(formId: string, responseId: string, fieldId: string, filename: string): Promise<void> {
  const driveId = await resolveDriveIdByLibraryName(LIBRARY_NAMES.attachments);
  const path = attachmentPath(formId, responseId, fieldId, filename);
  await graphFetch(`/drives/${driveId}/root:/${path}`, { method: "DELETE", scopes: graphScopes.sites });
}

/**
 * Uploads a builder-time media asset (logo, header image, background image)
 * into the same "Attachments" library, under `branding/{formId}/{kind}/`
 * rather than a response folder — these belong to the form definition, not
 * any one response. Returns the file's webUrl for storing directly in
 * BrandingConfig.
 */
export async function uploadBrandingAsset(formId: string, kind: string, file: File): Promise<FileAttachment> {
  const driveId = await resolveDriveIdByLibraryName(LIBRARY_NAMES.attachments);
  const path = `branding/${formId}/${kind}/${sanitizeFilename(file.name)}`;
  const bytes = await file.arrayBuffer();

  const result = await graphUploadBinary<DriveItemUploadResult>(`/drives/${driveId}/root:/${path}:/content`, bytes, {
    contentType: file.type || "application/octet-stream",
    scopes: graphScopes.sites,
  });

  // Stored as a graph-image:// reference, not the raw webUrl — see
  // lib/graphImageRef.ts: webUrl only renders for a browser that already
  // has its own SharePoint session cookie, which incognito/private windows
  // (how this app gets tested) never have.
  return { name: file.name, url: encodeGraphImageRef(driveId, path), size: result.size };
}
