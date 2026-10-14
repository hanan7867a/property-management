import { createClient } from "@/utils/supabase/client";

export const FILE_BUCKET = "kiraya-files";
const PREFIX = "file:";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1600;
const SIGNED_URL_SECONDS = 60 * 60;

const signedUrls = new Map<string, { url: string; expires: number }>();

export function isStoredFile(value?: string | null): value is string {
  return Boolean(value) && value!.startsWith(PREFIX);
}

export function isViewableFile(value?: string | null): value is string {
  return Boolean(value) && (value!.startsWith(PREFIX) || value!.startsWith("data:") || value!.startsWith("https://") || value!.startsWith("http://"));
}

function extensionFor(file: Blob, name?: string) {
  const byType: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };
  if (byType[file.type]) return byType[file.type];
  const fromName = name?.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  return fromName && fromName.length <= 5 ? fromName : "bin";
}

async function shrinkImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const longest = Math.max(bitmap.width, bitmap.height);
    if (longest <= MAX_IMAGE_SIDE && file.size <= 1.5 * 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const scale = Math.min(1, MAX_IMAGE_SIDE / longest);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

async function putBlob(blob: Blob, folder: string, originalName?: string): Promise<string> {
  if (blob.size > MAX_BYTES) throw new Error("This file is larger than 10 MB. Choose a smaller file.");
  const path = `${folder}/${crypto.randomUUID()}.${extensionFor(blob, originalName)}`;
  const { error } = await createClient().storage.from(FILE_BUCKET).upload(path, blob, {
    contentType: blob.type || "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error(`File could not be uploaded: ${error.message}`);
  return `${PREFIX}${path}`;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => (typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read the selected file."))));
    reader.addEventListener("error", () => reject(new Error("Could not read the selected file.")));
    reader.readAsDataURL(file);
  });
}

/** Uploads to Supabase Storage and returns a short "file:<path>" value. Falls back to inline data if Storage is unavailable, so a save never fails. */
export async function saveFile(file: File, folder: string): Promise<string> {
  const blob = await shrinkImage(file);
  try {
    return await putBlob(blob, folder, file.name);
  } catch (cause) {
    if (blob.size > MAX_BYTES) throw cause;
    console.warn("Storage upload failed, keeping the file inline for now.", cause);
    return readAsDataUrl(blob);
  }
}

export async function resolveFileUrl(value: string): Promise<string | undefined> {
  if (!isStoredFile(value)) return isViewableFile(value) ? value : undefined;
  const cached = signedUrls.get(value);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await createClient().storage.from(FILE_BUCKET).createSignedUrl(value.slice(PREFIX.length), SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return undefined;
  signedUrls.set(value, { url: data.signedUrl, expires: Date.now() + (SIGNED_URL_SECONDS - 300) * 1000 });
  return data.signedUrl;
}

type Migratable = {
  tenants: { cnicFrontUrl?: string; cnicBackUrl?: string; agreementUrl?: string }[];
  documents: { url: string; type: string }[];
  expenses: { billUrl: string }[];
  ownerPayments: { paymentProofUrl?: string; receiptUrl?: string }[];
};

/** Moves photos that were saved inline as base64 into Storage. Returns the replacement map (data URL -> file path); stops quietly on the first failure. */
export async function migrateInlineFiles(state: Migratable): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const add = (value?: string, folder = "misc") => {
    if (value && value.startsWith("data:") && !found.has(value)) found.set(value, folder);
  };
  for (const tenant of state.tenants) {
    add(tenant.cnicFrontUrl, "cnic");
    add(tenant.cnicBackUrl, "cnic");
    add(tenant.agreementUrl, "agreements");
  }
  for (const document of state.documents) add(document.url, document.type === "CNIC" ? "cnic" : "documents");
  for (const expense of state.expenses) add(expense.billUrl, "bills");
  for (const payment of state.ownerPayments) {
    add(payment.paymentProofUrl, "payments");
    add(payment.receiptUrl, "payments");
  }

  const replacements = new Map<string, string>();
  for (const [dataUrl, folder] of found) {
    try {
      const blob = await (await fetch(dataUrl)).blob();
      replacements.set(dataUrl, await putBlob(blob, folder));
    } catch (cause) {
      console.warn("Moving a saved photo to Storage failed; it will be retried next time.", cause);
      break;
    }
  }
  return replacements;
}
