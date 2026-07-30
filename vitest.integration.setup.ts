import { config } from "dotenv";

// Loads the same .env.local the app itself uses locally, so integration
// tests see the real staging credentials via process.env without
// duplicating them anywhere. See INTEGRATION_TESTING_STRATEGY.md §6 —
// no new secrets, no second credentials file.
config({ path: ".env.local" });
