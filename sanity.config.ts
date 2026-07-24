import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { schemaTypes, SINGLETON_TYPES } from "./src/sanity/schemaTypes";

// Not connected to a live project yet — NEXT_PUBLIC_SANITY_PROJECT_ID is
// empty until the Ordift-owned Sanity project exists (see
// CMS_MIGRATION.md "Finishing the connection"). This file can be
// evaluated safely with an empty projectId; it only fails at the moment
// someone actually opens /studio, which is expected and does not affect
// any other route.
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || "";
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "staging";

// Pins every singleton type (see SINGLETON_TYPES) to a single fixed
// document in the desk structure, and everything else to its normal
// list view — the standard Sanity pattern for "this type should only
// ever have one document."
function structure(S: import("sanity/structure").StructureBuilder) {
  const singletonItems = Array.from(SINGLETON_TYPES).map((typeName) =>
    S.listItem()
      .title(schemaTypes.find((t) => t.name === typeName)?.title ?? typeName)
      .id(typeName)
      .child(S.document().schemaType(typeName).documentId(typeName))
  );

  // Object types (seo, mediaAsset, galleryImage, ctaButton, socialLink)
  // aren't standalone documents — they only exist nested inside other
  // documents — so they must never appear as top-level browsable list
  // items alongside real content types. Found live: without this filter
  // they rendered anyway (Sanity doesn't error on it), just nonsensically.
  const listedTypes = schemaTypes.filter(
    (t) => t.type === "document" && !SINGLETON_TYPES.has(t.name)
  );

  return S.list()
    .title("Ordift Studios")
    .items([
      ...singletonItems,
      S.divider(),
      ...listedTypes.map((t) => S.documentTypeListItem(t.name)),
    ]);
}

export default defineConfig({
  name: "ordift-studios",
  title: "Ordift Studios",
  projectId,
  dataset,
  basePath: "/studio",
  plugins: [structureTool({ structure })],
  schema: { types: schemaTypes },
});
