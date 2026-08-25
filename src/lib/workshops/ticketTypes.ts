import { createAdminClient } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/admin/activityLog";

// Workshop Management V1, Phase B (2026-08-25) — against
// public.ticket_types (supabase/migrations/0047_workshop_management_v1.sql).
// price_usd is the USD reference amount, matching the existing
// payments.reference_amount_usd/workshop_registrations.amount_due
// convention exactly — never a client-supplied amount.

export type TicketType = {
  id: string;
  workshopId: string;
  name: string;
  description: string | null;
  priceUsd: number;
  currency: string;
  capacity: number | null;
  seatsReserved: number;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
  active: boolean;
  perPersonLimit: number | null;
};

const SELECT =
  "id, workshop_id, name, description, price_usd, currency, capacity, seats_reserved, sale_starts_at, sale_ends_at, active, per_person_limit";

function mapTicketType(r: {
  id: string;
  workshop_id: string;
  name: string;
  description: string | null;
  price_usd: number;
  currency: string;
  capacity: number | null;
  seats_reserved: number;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  active: boolean;
  per_person_limit: number | null;
}): TicketType {
  return {
    id: r.id,
    workshopId: r.workshop_id,
    name: r.name,
    description: r.description,
    priceUsd: Number(r.price_usd),
    currency: r.currency,
    capacity: r.capacity,
    seatsReserved: r.seats_reserved,
    saleStartsAt: r.sale_starts_at,
    saleEndsAt: r.sale_ends_at,
    active: r.active,
    perPersonLimit: r.per_person_limit,
  };
}

export async function listTicketTypesForWorkshop(workshopId: string, activeOnly = false): Promise<TicketType[]> {
  const admin = createAdminClient();
  let query = admin.from("ticket_types").select(SELECT).eq("workshop_id", workshopId).order("sort_order");
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) {
    console.error("[workshops] failed to load ticket_types", error.message);
    return [];
  }
  return (data ?? []).map(mapTicketType);
}

export async function listAllTicketTypes(): Promise<TicketType[]> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("ticket_types").select(SELECT).order("workshop_id").order("sort_order");
  if (error) {
    console.error("[workshops] failed to load ticket_types", error.message);
    return [];
  }
  return (data ?? []).map(mapTicketType);
}

// Pure eligibility check — sale window/active flag only (capacity is
// checked atomically by the reserve_ticket_type_seat() RPC at the
// moment of registration, not here, since a count read here could go
// stale before the insert). Exported for unit testing.
export function isTicketTypeCurrentlyOnSale(ticket: Pick<TicketType, "active" | "saleStartsAt" | "saleEndsAt">, now = new Date()): boolean {
  if (!ticket.active) return false;
  if (ticket.saleStartsAt && new Date(ticket.saleStartsAt) > now) return false;
  if (ticket.saleEndsAt && new Date(ticket.saleEndsAt) <= now) return false;
  return true;
}

export type ReserveTicketResult =
  | { ok: true; ticket: TicketType }
  | { ok: false; error: "not-found" | "not-on-sale" | "sold-out" };

// The real, atomic, race-safe reservation — calls reserve_ticket_type_seat()
// (a single UPDATE...WHERE...RETURNING, taking a row lock; see the
// migration's own comment for why this is safe under concurrency,
// unlike a separate count-then-insert). Returns the ticket row (for
// price resolution) only once a seat has actually, atomically been
// claimed. Callers that fail to complete the registration afterward
// MUST call releaseTicketTypeSeat() to avoid leaking a phantom
// reservation.
export async function reserveTicketTypeSeat(ticketTypeId: string): Promise<ReserveTicketResult> {
  const admin = createAdminClient();
  const { data: ticket, error: fetchError } = await admin.from("ticket_types").select(SELECT).eq("id", ticketTypeId).maybeSingle();
  if (fetchError || !ticket) return { ok: false, error: "not-found" };

  const { data: reserved, error: rpcError } = await admin.rpc("reserve_ticket_type_seat", { p_ticket_type_id: ticketTypeId });
  if (rpcError) {
    console.error("[workshops] reserve_ticket_type_seat RPC failed", rpcError.message);
    return { ok: false, error: "not-on-sale" };
  }
  if (!reserved) {
    // Distinguish "never on sale" from "was on sale, now full" for a
    // clearer error to the registrant — the RPC's WHERE clause already
    // re-checked the sale window atomically, so re-deriving from the
    // already-fetched row here is just for the error message, not a
    // second authorization decision.
    if (!isTicketTypeCurrentlyOnSale(mapTicketType(ticket))) return { ok: false, error: "not-on-sale" };
    return { ok: false, error: "sold-out" };
  }

  return { ok: true, ticket: mapTicketType(ticket) };
}

export async function releaseTicketTypeSeat(ticketTypeId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc("release_ticket_type_seat", { p_ticket_type_id: ticketTypeId });
  if (error) {
    console.error("[workshops] release_ticket_type_seat RPC failed", ticketTypeId, error.message);
  }
}

export type CreateTicketTypeParams = {
  workshopId: string;
  name: string;
  description?: string | null;
  priceUsd: number;
  currency?: string;
  capacity?: number | null;
  saleStartsAt?: string | null;
  saleEndsAt?: string | null;
  perPersonLimit?: number | null;
  actorUserId: string;
};

export async function createTicketType(params: CreateTicketTypeParams): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ticket_types")
    .insert({
      workshop_id: params.workshopId,
      name: params.name,
      description: params.description ?? null,
      price_usd: params.priceUsd,
      currency: params.currency ?? "USD",
      capacity: params.capacity ?? null,
      sale_starts_at: params.saleStartsAt ?? null,
      sale_ends_at: params.saleEndsAt ?? null,
      per_person_limit: params.perPersonLimit ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[workshops] failed to create ticket_type", error?.message);
    return { ok: false, error: "Failed to create the ticket type." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "workshop.ticket_type.created",
    entityType: "ticket_type",
    entityId: data.id,
    metadata: { workshopId: params.workshopId, name: params.name, priceUsd: params.priceUsd },
  });

  return { ok: true, id: data.id };
}

export async function setTicketTypeActive(params: { ticketTypeId: string; active: boolean; actorUserId: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { error } = await admin.from("ticket_types").update({ active: params.active }).eq("id", params.ticketTypeId);
  if (error) {
    console.error("[workshops] failed to toggle ticket_type", error.message);
    return { ok: false, error: "Failed to update." };
  }

  await logActivity({
    actorUserId: params.actorUserId,
    action: "workshop.ticket_type.toggled",
    entityType: "ticket_type",
    entityId: params.ticketTypeId,
    metadata: { active: params.active },
  });

  return { ok: true };
}
