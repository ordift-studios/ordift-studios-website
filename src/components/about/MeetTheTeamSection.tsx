"use client";

import { useState } from "react";
import MeetTheTeamCarousel from "./MeetTheTeamCarousel";
import TeamMemberModal from "./TeamMemberModal";
import type { PublicTeamMember } from "@/lib/team/types";

// Owns the "which member is open" state connecting the carousel (click
// -> select) to the modal (selected member -> render, close -> clear).
// Split out from the server-rendered About page itself only because
// this state has to live in a Client Component; the page stays a plain
// async Server Component fetching members server-side.
export default function MeetTheTeamSection({ members }: { members: PublicTeamMember[] }) {
  const [selected, setSelected] = useState<PublicTeamMember | null>(null);

  if (members.length === 0) return null;

  return (
    <>
      <MeetTheTeamCarousel members={members} onSelect={setSelected} />
      {selected && <TeamMemberModal member={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
