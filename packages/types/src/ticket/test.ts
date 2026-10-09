import { describe, expect, it } from "vitest";
import { TicketQuote } from "./cost.ts";
import { TicketCreate } from "./ticket.ts";
import { TicketUpdateCreate } from "./update.ts";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("ticket", () => {
  it("accepts a ticket with priority default", () => {
    const ticket = TicketCreate.parse({
      propertyId: UUID,
      category: "plumbing",
      title: "Leaking tap in kitchen",
      description: "Drips constantly.",
    });
    expect(ticket.priority).toBe("medium");
  });
  it.each([{ title: "Tap" }, { description: "" }, { category: "" }])(
    "rejects ticket %s",
    (patch) => {
      expect(() =>
        TicketCreate.parse({
          propertyId: UUID,
          category: "plumbing",
          title: "Leaking tap in kitchen",
          description: "Drips constantly.",
          ...patch,
        }),
      ).toThrow();
    },
  );
  it("accepts updates and quotes", () => {
    expect(TicketUpdateCreate.parse({ body: "On my way" }).visibility).toBe("shared");
    expect(TicketQuote.parse({ quotedAmountKobo: 50000 }).quotedAmountKobo).toBe(50000);
  });
});
