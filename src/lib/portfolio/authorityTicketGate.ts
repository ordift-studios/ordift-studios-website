// Switch for the authority-ticket step (migration 0185). Kept in its own file with no imports so client components can read it. FALSE until the migration is applied AND the application is ready:
// once the database requires tickets, a privileged write without one is refused.
export const AUTHORITY_TICKETS_ENABLED = true;
