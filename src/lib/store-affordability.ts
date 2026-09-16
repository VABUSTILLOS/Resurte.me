/**
 * Cálculos puros de accesibilidad de canje en la Tienda de Crecimiento.
 * Sin dependencias de React ni de red: se testea de forma aislada y se usa
 * desde `StoreScreen` para explicar cuánto falta para cada servicio.
 */

export interface ServiceLike {
  id: string;
  name: string;
  cost: number;
}

export interface ServiceAffordability {
  /** true si el saldo alcanza para canjear el servicio. */
  affordable: boolean;
  /** Créditos que faltan (0 si ya es canjeable). */
  missing: number;
  /** Avance hacia el costo, 0–100. */
  percent: number;
}

/**
 * Avance del saldo hacia el costo de un servicio. Un costo no positivo o no
 * finito se trata como "ya accesible" con avance 100 para no mostrar una
 * barra de progreso sin sentido.
 */
export function serviceAffordability(cost: number, balance: number): ServiceAffordability {
  if (!Number.isFinite(cost) || cost <= 0) {
    return { affordable: true, missing: 0, percent: 100 };
  }

  const safeBalance = Number.isFinite(balance) && balance > 0 ? balance : 0;
  const affordable = safeBalance >= cost;
  const missing = affordable ? 0 : cost - safeBalance;
  const percent = Math.min(100, Math.max(0, Math.round((safeBalance / cost) * 100)));

  return { affordable, missing, percent };
}

/** Cuántos servicios del catálogo puede canjear hoy el usuario. */
export function countAffordable<T extends ServiceLike>(
  services: readonly T[],
  balance: number
): number {
  return services.filter((service) => serviceAffordability(service.cost, balance).affordable)
    .length;
}

/**
 * El servicio NO accesible más cercano a alcanzar (menor cantidad faltante).
 * `null` cuando el catálogo está vacío o todo es canjeable ya.
 */
export function findNearestReachable<T extends ServiceLike>(
  services: readonly T[],
  balance: number
): (T & ServiceAffordability) | null {
  let nearest: (T & ServiceAffordability) | null = null;

  for (const service of services) {
    const affordability = serviceAffordability(service.cost, balance);
    if (affordability.affordable) continue;
    if (!nearest || affordability.missing < nearest.missing) {
      nearest = { ...service, ...affordability };
    }
  }

  return nearest;
}
