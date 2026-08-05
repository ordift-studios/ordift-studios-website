import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Shared by opengraph-image.tsx and twitter-image.tsx (Next.js file
// conventions, both require this exact 1200x630 render) — the real gold
// lockup logo composited on the real navy brand gradient, not an
// invented visual. Colors are hardcoded hex because Satori (the renderer
// behind ImageResponse) has no access to this app's CSS custom
// properties; values copied from globals.css --color-navy-950/-900.
export async function renderBrandOgImage() {
  const logoData = await readFile(join(process.cwd(), "public/brand/logo-full-gold.png"));
  const logoSrc = `data:image/png;base64,${logoData.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(ellipse at 50% 40%, #111a2e 0%, #0b1220 65%)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori requires a plain <img>, not next/image */}
        <img src={logoSrc} width={340} height={376} alt="Ordift Studios" />
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
