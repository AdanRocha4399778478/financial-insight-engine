import { describe, expect, it } from "vitest";
import { parseNumber } from "./parse-file";

describe("parseNumber", () => {
  it("usa o valor numérico bruto da célula", () => {
    expect(parseNumber(18500)).toBe(18500);
    expect(parseNumber(-18500.25)).toBe(-18500.25);
  });

  it("formato americano com milhar", () => {
    expect(parseNumber("18,500.00")).toBe(18500);
    expect(parseNumber("1,234,567.89")).toBeCloseTo(1234567.89);
  });

  it("formato brasileiro", () => {
    expect(parseNumber("18.500,00")).toBe(18500);
    expect(parseNumber("1.234.567,89")).toBeCloseTo(1234567.89);
    expect(parseNumber("R$ 1.500")).toBe(1500);
  });

  it("negativos e vazios", () => {
    expect(parseNumber("(1.234,56)")).toBeCloseTo(-1234.56);
    expect(parseNumber("-18,500.00")).toBe(-18500);
    expect(parseNumber("")).toBe(0);
    expect(parseNumber(null)).toBe(0);
  });
});
