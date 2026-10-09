import { describe, expect, it } from "vitest";
import { contractStatusValues } from "../common/enums.ts";
import { LeaseCreate } from "./lease.ts";
import { assertTransition, isTerminal, TERMINAL_STATES, TRANSITIONS } from "./lifecycle.ts";
import { ContractPartyCreate } from "./party.ts";

const LEGAL: [string, string][] = [
  ["draft", "in_review"],
  ["in_review", "approved"],
  ["in_review", "rejected"],
  ["approved", "active"],
  ["active", "suspended"],
  ["suspended", "active"],
  ["active", "terminated"],
  ["active", "expired"],
  ["active", "renewed"],
];

describe("lifecycle", () => {
  it("accepts every legal transition", () => {
    for (const [from, to] of LEGAL) {
      expect(() =>
        assertTransition(
          from as (typeof contractStatusValues)[number],
          to as (typeof contractStatusValues)[number],
        ),
      ).not.toThrow();
    }
  });

  it("refuses a transition the machine does not contain", () => {
    expect(() => assertTransition("active", "approved")).toThrow(/illegal transition/);
    expect(() => assertTransition("draft", "active")).toThrow(/illegal transition/);
    expect(() => assertTransition("terminated", "active")).toThrow(/illegal transition/);
  });

  it("covers exactly the nine documented states, terminals have no outgoing", () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...contractStatusValues].sort());
    for (const terminal of TERMINAL_STATES) {
      expect(TRANSITIONS[terminal]).toEqual([]);
      expect(isTerminal(terminal)).toBe(true);
    }
    expect(isTerminal("active")).toBe(false);
  });
});

describe("lease", () => {
  const base = {
    propertyId: "11111111-1111-4111-8111-111111111111",
    primaryPayerId: "22222222-2222-4222-8222-222222222222",
    startDate: "2026-01-01",
    rentKobo: 50000000,
  };
  it("accepts a minimal lease", () => {
    expect(LeaseCreate.parse(base).rentCadenceMonths).toBe(12);
  });
  it.each([{ rentKobo: -1 }, { startDate: "01-01-2026" }, { rentCadenceMonths: 13 }])(
    "rejects %s",
    (patch) => {
      expect(() => LeaseCreate.parse({ ...base, ...patch })).toThrow();
    },
  );
});

describe("party", () => {
  it("accepts a guarantor with a phone", () => {
    const party = ContractPartyCreate.parse({
      partyName: "Ada Guarantor",
      partyRole: "guarantor",
      phoneE164: "+2348012345678",
    });
    expect(party.isPrimary).toBe(false);
  });
  it("rejects a bad phone and a bad role", () => {
    expect(() =>
      ContractPartyCreate.parse({ partyName: "X", partyRole: "guarantor", phoneE164: "0801" }),
    ).toThrow();
    expect(() => ContractPartyCreate.parse({ partyName: "X", partyRole: "payer" })).toThrow();
  });
});
