/**
 * Cuenta receptora de transferencias SPEI (pago manual).
 *
 * Fuente única de los datos que se le muestran al cliente para transferir. Antes
 * vivían en `process.env.NEXT_PUBLIC_SPEI_*` con fallback vacío: sin esas
 * variables configuradas, el checkout decía "todavía no publicamos una CLABE" y
 * **nadie podía pagar por transferencia** (de 24 pedidos en producción, cero
 * SPEI). Los datos son públicos por diseño —son la cuenta a la que el cliente
 * transfiere—, así que viven en el repo como valor por defecto y el env solo
 * sirve para sobreescribirlos sin tocar código.
 *
 * Lo que **no** se publica es el número de tarjeta de débito: para SPEI no se
 * usa (lo que identifica la cuenta es la CLABE) y no aporta nada al cliente.
 */

export interface SpeiAccount {
  /** CLABE interbancaria (18 dígitos). */
  clabe: string
  /** Banco y producto, tal como lo pide la banca en línea. */
  banco: string
  /** Titular de la cuenta: debe coincidir con lo que muestra el banco. */
  beneficiario: string
  /** Número de cuenta (alternativa a la CLABE para transferencias internas). */
  cuenta: string
}

const DEFAULT_SPEI_ACCOUNT: SpeiAccount = {
  clabe: "014150606044477078",
  banco: "SANTANDER SUPERCUENTA CHEQUES",
  beneficiario: "Victor Alberto Bustillos Tena",
  cuenta: "60-60444770-7",
}

/**
 * Datos vigentes de la cuenta. Los `NEXT_PUBLIC_*` se leen con referencia
 * directa (Next los sustituye en build; una lectura dinámica no se inlinea).
 */
export function getSpeiAccount(): SpeiAccount {
  return {
    clabe: process.env.NEXT_PUBLIC_SPEI_CLABE?.trim() || DEFAULT_SPEI_ACCOUNT.clabe,
    banco: process.env.NEXT_PUBLIC_SPEI_BANCO?.trim() || DEFAULT_SPEI_ACCOUNT.banco,
    beneficiario:
      process.env.NEXT_PUBLIC_SPEI_BENEFICIARIO?.trim() || DEFAULT_SPEI_ACCOUNT.beneficiario,
    cuenta: DEFAULT_SPEI_ACCOUNT.cuenta,
  }
}

/**
 * CLABE en grupos de 4 (`0141 5060 6044 4770 78`).
 *
 * Se lee en voz alta y se copia a la banca sin perder dígitos: una CLABE de 18
 * dígitos corridos es el dato que más se transcribe mal. Devuelve la cadena tal
 * cual si no tiene la longitud esperada, para no inventar agrupaciones.
 */
export function formatClabe(clabe: string): string {
  const digits = clabe.replace(/\s/g, "")
  if (digits.length !== 18) return clabe
  return digits.replace(/(.{4})(?=.)/g, "$1 ")
}
