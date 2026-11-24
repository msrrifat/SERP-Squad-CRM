/* Google Drive through a service account.

   A service account is a Google identity of its own with an email address. The
   agency shares a Drive folder with that address (as it would with a
   colleague) and this server can then read that folder, and only what is
   shared with it. No person's Google sign-in is involved and nothing expires.

   One limit set by Google: a service account has no storage of its own, so it
   can create files only inside a shared drive (Google Workspace). In a folder
   of a personal Drive it can read but not create; that error is passed on in
   plain words.

   The account's private key stays in the agent's encrypted secrets
   (agentops.js); nothing here writes it anywhere or returns it. */
import { createSign } from "node:crypto";

const TOKEN_URL = process.env.AGENTOPS_GTOKEN_URL || "https://oauth2.googleapis.com/token";
const API = (process.env.AGENTOPS_GDRIVE_BASE || "https://www.googleapis.com").replace(/\/+$/, "");
const SCOPE = "https://www.googleapis.com/auth/drive";
const ID = /^[A-Za-z0-9_-]{10,80}$/;
const b64 = (x) => Buffer.from(x).toString("base64url");
const tokens = new Map();                       // account email -> { token, until }

export const GOOGLE_DOC = "application/vnd.google-apps.document", GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet", GOOGLE_FOLDER = "application/vnd.google-apps.folder";

/* the key file Google hands out for a service account, as pasted by the manager */
export function parseServiceAccount(text) {
  let j;
  try { j = JSON.parse(String(text || "").trim()); } catch { throw new Error("That is not the key file. Paste the whole content of the .json file Google gave you for the service account."); }
  if (j?.type !== "service_account") throw new Error("That file is not a service account key (its type is not \"service_account\"). Create a key of type JSON for a service account in the Google Cloud console.");
  const clientEmail = String(j.client_email || "").trim(), privateKey = String(j.private_key || "");
  if (!/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(clientEmail) || !/-----BEGIN (RSA )?PRIVATE KEY-----/.test(privateKey)) throw new Error("The key file is incomplete: it has no service account address or no private key.");
  return { clientEmail, privateKey, projectId: String(j.project_id || "").slice(0, 80) };
}

class DriveError extends Error {
  constructor(message, status, reason) { super(message); this.status = status; this.reason = reason || ""; }
}
const explain = (status, reason, message) => {
  if (reason === "storageQuotaExceeded" || /storage quota/i.test(message)) return "Google does not let a service account keep files in a personal Drive. Put the folder in a shared drive (Google Workspace), or keep working documents in a folder on the agent's computer that Drive for desktop syncs.";
  if (status === 404) return "Google Drive has nothing there for this account: the folder or file was removed, or it is not shared with the service account's address.";
  if (status === 403 && /insufficient|permission|forbidden|not have/i.test(message)) return "The service account may not do that there. Share the folder with its address (as Viewer to read, as Editor or Content manager to create files).";
  if (status === 403 && /disabled|not been used|accessNotConfigured/i.test(message + reason)) return "The Google Drive API is not switched on in the Google Cloud project of this service account. Enable \"Google Drive API\" there.";
  if (status === 401) return "Google did not accept the service account's key. It was deleted or disabled in the Google Cloud console.";
  if (status === 429 || reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") return "Google Drive is asking to slow down. Try again in a minute.";
  return `Google Drive answered with an error (${status}): ${String(message || "no reason given").slice(0, 160)}`;
};

async function token(sa) {
  const have = tokens.get(sa.clientEmail);
  if (have && have.until > Date.now() + 60000) return have.token;
  const iat = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: "RS256", typ: "JWT" })), claims = b64(JSON.stringify({ iss: sa.clientEmail, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat, exp: iat + 3300 }));
  let signature;
  try { signature = createSign("RSA-SHA256").update(head + "." + claims).sign(sa.privateKey).toString("base64url"); } catch { throw new DriveError("The service account's private key cannot be used. Paste the key file again.", 400, "badKey"); }
  let r, d;
  try {
    r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${signature}` }), signal: AbortSignal.timeout(20000) });
    d = await r.json().catch(() => ({}));
  } catch { throw new DriveError("Google could not be reached from the server. Try again in a minute.", 502, "network"); }
  if (!r.ok || !d.access_token) throw new DriveError(/invalid_grant/.test(d.error || "") ? "Google did not accept the service account's key. It was deleted or disabled in the Google Cloud console, or the server's clock is wrong." : `Google refused to sign the service account in (${d.error_description || d.error || r.status}).`, 401, "auth");
  tokens.set(sa.clientEmail, { token: d.access_token, until: Date.now() + Math.min(3300, +d.expires_in || 3300) * 1000 });
  return d.access_token;
}
export const forgetDriveToken = (email) => { if (email) tokens.delete(email); else tokens.clear(); };

async function call(sa, path, init = {}, as = "json") {
  const t = await token(sa);
  let r;
  try { r = await fetch(API + path, { ...init, headers: { Authorization: "Bearer " + t, ...(init.headers || {}) }, signal: AbortSignal.timeout(init.timeoutMs || 60000) }); }
  catch { throw new DriveError("Google Drive could not be reached from the server. Try again in a minute.", 502, "network"); }
  if (!r.ok) {
    const d = await r.json().catch(() => ({})), e = d.error || {};
    if (r.status === 401) tokens.delete(sa.clientEmail);
    throw new DriveError(explain(r.status, e.errors?.[0]?.reason || e.status || "", e.message || ""), r.status, e.errors?.[0]?.reason || "");
  }
  if (as === "buffer") return Buffer.from(await r.arrayBuffer());
  if (as === "text") return r.text();
  return r.json().catch(() => ({}));
}
const need = (id) => { if (!ID.test(String(id || ""))) throw new DriveError("That is not a Google Drive folder or file.", 400, "badId"); return id; };
const ALL = "supportsAllDrives=true";
const view = (f) => ({ id: f.id, name: String(f.name || "").slice(0, 200), mimeType: f.mimeType || "", folder: f.mimeType === GOOGLE_FOLDER, document: /^application\/vnd\.google-apps\./.test(f.mimeType || "") && f.mimeType !== GOOGLE_FOLDER, modified: String(f.modifiedTime || "").slice(0, 10), size: +f.size || 0, ...(f.webViewLink ? { link: f.webViewLink } : {}) });

/** Who the key signs in as: proves the key works and the Drive API is on. Costs nothing. */
export async function driveWho(sa) { const d = await call(sa, "/drive/v3/about?fields=user(emailAddress)"); return d.user?.emailAddress || sa.clientEmail; }
/** What is in one folder (up to 400 entries, folders first). */
export async function driveList(sa, folderId) {
  const q = encodeURIComponent(`'${need(folderId)}' in parents and trashed = false`), out = [];
  let page = "";
  for (let i = 0; i < 2; i++) {
    const d = await call(sa, `/drive/v3/files?q=${q}&fields=${encodeURIComponent("nextPageToken,files(id,name,mimeType,modifiedTime,size,webViewLink)")}&pageSize=200&orderBy=folder,name&${ALL}&includeItemsFromAllDrives=true${page ? "&pageToken=" + encodeURIComponent(page) : ""}`);
    out.push(...(d.files || []).map(view));
    page = d.nextPageToken || "";
    if (!page) break;
  }
  return { entries: out, more: !!page };
}
export async function driveMeta(sa, id) { return view(await call(sa, `/drive/v3/files/${need(id)}?fields=${encodeURIComponent("id,name,mimeType,modifiedTime,size,webViewLink")}&${ALL}`)); }
/** The bytes of an ordinary file (not a Google document). */
export async function driveDownload(sa, id) { return call(sa, `/drive/v3/files/${need(id)}?alt=media&${ALL}`, { timeoutMs: 180000 }, "buffer"); }
/** A Google document as text, or a Google sheet as CSV (its first tab). */
export async function driveExport(sa, id, mime) { return call(sa, `/drive/v3/files/${need(id)}/export?mimeType=${encodeURIComponent(mime)}`, { timeoutMs: 120000 }, "text"); }
/** Create a Google sheet (from CSV) or a Google document (from HTML) in a folder. */
export async function driveCreate(sa, { name, parent, target, contentType, content }) {
  const boundary = "serpsquad" + Date.now().toString(36);
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [need(parent)], mimeType: target })}\r\n--${boundary}\r\nContent-Type: ${contentType}; charset=UTF-8\r\n\r\n${content}\r\n--${boundary}--`;
  return view(await call(sa, `/upload/drive/v3/files?uploadType=multipart&fields=${encodeURIComponent("id,name,mimeType,modifiedTime,webViewLink")}&${ALL}`, { method: "POST", headers: { "Content-Type": "multipart/related; boundary=" + boundary }, body, timeoutMs: 120000 }));
}
/** Replace what a Google sheet or document holds. */
export async function driveReplace(sa, id, contentType, content) {
  return view(await call(sa, `/upload/drive/v3/files/${need(id)}?uploadType=media&fields=${encodeURIComponent("id,name,mimeType,modifiedTime,webViewLink")}&${ALL}`, { method: "PATCH", headers: { "Content-Type": contentType + "; charset=UTF-8" }, body: content, timeoutMs: 120000 }));
}
