import { describe, expect, it } from "vitest";
import { detectActivities, licenceWarnings } from "./quotationLicenceWarnings";

const line = (serviceItem: string, description: string | null = null) => ({ serviceItem, description });

describe("detecting the activities a draft's lines appear to include", () => {
  it("finds videography from film and video wording", () => {
    expect(detectActivities([line("Event Film package, 4h")])).toContain("videography");
    expect(detectActivities([line("Corporate video, 1 day")])).toContain("videography");
    expect(detectActivities([line("Wedding highlight reel")])).toContain("videography");
  });
  it("finds photography without inventing videography", () => {
    expect(detectActivities([line("Personal Portrait, 4h, Individual", "Market: Qatar; Session length: 4h")])).toEqual(["photography"]);
    expect(detectActivities([line("Corporate headshots")])).toEqual(["photography"]);
  });
  it("finds several at once and uses the enquiry's service when it names an activity exactly", () => {
    expect(detectActivities([line("Photo and film coverage"), line("Drone footage")])).toEqual(["drone_operations", "photography", "videography"]);
    expect(detectActivities([line("Coverage")], "Videography")).toEqual(["videography"]);
    expect(detectActivities([line("Coverage")], "something else")).toEqual([]);
  });
});

describe("the early warning", () => {
  const qatar = { entityName: "Ordift Studios (Qatar)", jurisdiction: "Qatar" };
  it("warns for an activity the entity's own assessment says is not licensed, naming the entity, and says issuing will be refused", () => {
    const w = licenceWarnings({ ...qatar, detected: ["photography", "videography"], states: [{ key: "photography", label: "Photography", state: "listed_on_registration" }, { key: "videography", label: "Videography", state: "not_licensed" }] });
    expect(w).toHaveLength(1);
    expect(w[0].activity).toBe("videography");
    expect(w[0].text).toMatch(/videography/i);
    expect(w[0].text).toMatch(/Ordift Studios \(Qatar\) \(Qatar\)/);
    expect(w[0].text).toMatch(/refused/);
    expect(w[0].text).toMatch(/not moved to another entity automatically/);
  });
  it("does not warn for licensed or listed activities, nor for activities that were not detected", () => {
    expect(licenceWarnings({ ...qatar, detected: ["photography"], states: [{ key: "photography", label: "Photography", state: "listed_on_registration" }] })).toEqual([]);
    expect(licenceWarnings({ ...qatar, detected: ["photography"], states: [{ key: "videography", label: "Videography", state: "not_licensed" }] })).toEqual([]);
  });
  it("treats a planned or suspended activity as not licensed (a plan never counts)", () => {
    const w = licenceWarnings({ ...qatar, detected: ["videography"], states: [{ key: "videography", label: "Videography", state: "planned" }] });
    expect(w[0].text).toMatch(/only planned/);
  });
});
