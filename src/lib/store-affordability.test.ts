import { describe, it, expect } from "vitest";
import {
  serviceAffordability,
  countAffordable,
  findNearestReachable,
} from "./store-affordability";

const CATALOG = [
  { id: "a", name: "Reseñas", cost: 2200 },
  { id: "b", name: "Maps", cost: 2800 },
  { id: "c", name: "Meta Ads", cost: 16000 },
];

describe("serviceAffordability", () => {
  it("marca accesible cuando el saldo cubre el costo", () => {
    expect(serviceAffordability(2200, 2200)).toEqual({
      affordable: true,
      missing: 0,
      percent: 100,
    });
  });

  it("calcula lo faltante y el avance cuando no alcanza", () => {
    expect(serviceAffordability(1000, 250)).toEqual({
      affordable: false,
      missing: 750,
      percent: 25,
    });
  });

  it("limita el avance a 100 aunque el saldo exceda el costo", () => {
    expect(serviceAffordability(1000, 5000).percent).toBe(100);
  });

  it("trata saldo negativo o inválido como cero", () => {
    expect(serviceAffordability(1000, -50)).toEqual({
      affordable: false,
      missing: 1000,
      percent: 0,
    });
    expect(serviceAffordability(1000, Number.NaN).percent).toBe(0);
  });

  it("considera accesible un costo cero o inválido", () => {
    expect(serviceAffordability(0, 0)).toEqual({
      affordable: true,
      missing: 0,
      percent: 100,
    });
  });
});

describe("countAffordable", () => {
  it("cuenta solo los servicios que el saldo cubre", () => {
    expect(countAffordable(CATALOG, 2500)).toBe(1);
    expect(countAffordable(CATALOG, 0)).toBe(0);
    expect(countAffordable(CATALOG, 60000)).toBe(3);
  });
});

describe("findNearestReachable", () => {
  it("devuelve el servicio no accesible con la menor cantidad faltante", () => {
    const nearest = findNearestReachable(CATALOG, 2500);
    expect(nearest?.id).toBe("b");
    expect(nearest?.missing).toBe(300);
  });

  it("devuelve null cuando todo es canjeable", () => {
    expect(findNearestReachable(CATALOG, 60000)).toBeNull();
  });

  it("devuelve null con catálogo vacío", () => {
    expect(findNearestReachable([], 1000)).toBeNull();
  });
});
