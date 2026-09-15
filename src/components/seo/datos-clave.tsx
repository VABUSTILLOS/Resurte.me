import { getCommercialFacts } from "@/lib/commercial-facts"

interface DatosClaveProps {
  /** Contexto de la página, p. ej. "Abarrotes en Chihuahua". */
  subject?: string
  className?: string
}

/**
 * Tabla de datos clave de Resurte.me.
 *
 * Va en HTML servido (no en cliente) y con un `id` estable para poder
 * referenciarla desde `speakable` y desde enlaces profundos: los motores de IA
 * citan mejor un bloque compacto de hechos que un párrafo de marketing.
 */
export function DatosClave({ subject, className }: DatosClaveProps) {
  const facts = getCommercialFacts()

  return (
    <section
      id="datos-clave"
      aria-labelledby="datos-clave-titulo"
      className={className}
    >
      <h2
        id="datos-clave-titulo"
        className="text-lg font-semibold text-[#1a1a1a]"
      >
        {subject ? `Datos clave: ${subject}` : "Datos clave"}
      </h2>
      <div className="mt-3 overflow-x-auto rounded-[12px] border border-[#E5E7EB] bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">
            {subject
              ? `Condiciones de compra y cobertura de Resurte.me para ${subject}`
              : "Condiciones de compra y cobertura de Resurte.me"}
          </caption>
          <tbody>
            {facts.map((fact) => (
              <tr
                key={fact.label}
                className="border-b border-[#E5E7EB] last:border-b-0"
              >
                <th
                  scope="row"
                  className="w-40 align-top px-4 py-3 font-semibold text-[#242529]"
                >
                  {fact.label}
                </th>
                <td className="px-4 py-3 text-[#5C6068]">
                  <span className="font-medium text-[#242529]">
                    {fact.value}
                  </span>
                  {fact.detail && (
                    <span className="block text-xs text-[#5C6068]">
                      {fact.detail}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
