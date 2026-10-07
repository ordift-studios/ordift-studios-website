"use client";

import { useState } from "react";
import { localInputToIso } from "@/lib/shared/instant";

// A date/time field that submits an exact INSTANT. The visible input is
// the user's own local wall time; the browser (which knows the user's
// real timezone) converts it to ISO-8601 UTC in a hidden field named
// `name`. The server therefore never has to guess an offset. The
// visible input has no name, so the naive string is never submitted.
export default function LocalDateTimeField({ name, className }: { name: string; className?: string }) {
  const [local, setLocal] = useState("");
  return (
    <>
      <input type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} className={className} />
      <input type="hidden" name={name} value={localInputToIso(local)} />
    </>
  );
}
