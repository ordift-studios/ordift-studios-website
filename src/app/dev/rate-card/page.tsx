import RateCardWorkspace from "./RateCardWorkspace";

// LOCAL DEVELOPMENT ONLY (branch pdf-poc — never deployed, never merged): the Draft → Preview workflow for the rate card. No approval is active and nothing is stored on a server.
export const metadata = { title: "Rate card draft (local)", robots: { index: false, follow: false } };
export default function Page() { return <RateCardWorkspace />; }
