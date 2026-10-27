import PocDownload from "./PocDownload";

// LOCAL PROOF OF CONCEPT (branch pdf-poc — never deployed, never merged). A throwaway page to test the in-browser "Download PDF" action with sample content only.
export const metadata = { title: "PDF proof of concept (local)", robots: { index: false, follow: false } };

export default function PocPage() {
  return (
    <main style={{ maxWidth: 560, margin: "64px auto", padding: "0 20px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Ordift Studios — PDF proof of concept</h1>
      <p style={{ color: "#555", lineHeight: 1.5 }}>Local test only. The document contains sample prices and a generated placeholder image — no client information.</p>
      <PocDownload />
    </main>
  );
}
