// The Step 7 evidence upload is a Next.js server action. Next caps the WHOLE action request body at 1 MiB (1,048,576 bytes) unless
// serverActions.bodySizeLimit is configured, and this release deliberately makes no configuration change. The entity vault itself accepts up to
// 10 MB, but a file that large cannot reach it through this form, so the form states and enforces the real limit (a little under 1 MiB leaves
// room for the other form fields and multipart overhead). Larger documents need a separate decision (configuration or another upload route).
export const STEP7_UPLOAD_MAX_BYTES = 1_000_000;
export const STEP7_UPLOAD_MAX_LABEL = "1 MB";
