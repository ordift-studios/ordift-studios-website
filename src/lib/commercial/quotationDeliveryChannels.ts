// Pure list of the ways a person can record having delivered a quotation (client-safe; the server module keeps the same values and validates them).
export const DELIVERY_CHANNELS_UI = [
  { value: "email", label: "Email (sent by you)" }, { value: "whatsapp_message", label: "WhatsApp message" }, { value: "telephone", label: "Telephone" },
  { value: "in_person", label: "In person" }, { value: "client_portal", label: "Client portal" }, { value: "other", label: "Other" },
] as const;
