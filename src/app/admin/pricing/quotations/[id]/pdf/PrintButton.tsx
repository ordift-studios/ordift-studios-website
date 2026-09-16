"use client";

export function PrintButton() {
  return (
    <div className="print-toolbar" style={{ textAlign: "center", margin: "16px 0", fontFamily: "sans-serif" }}>
      <button type="button" onClick={() => window.print()} style={{ padding: "8px 16px" }}>
        Print / Save as PDF
      </button>
    </div>
  );
}
