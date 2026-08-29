import Link from "next/link"
import { ArrowRight, Percent } from "lucide-react"

export function RewardsProgram() {
  return (
      <section className="bg-[#f7f5f0] py-12 md:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="relative bg-white rounded-2xl md:rounded-3xl shadow-[0_2px_40px_rgba(0,0,0,0.04)] border border-[#ede8df] overflow-hidden">
            {/* Subtle top accent bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#0E7A0E] via-[#3CC73C] to-[#0E7A0E]" />
            
            <div className="p-6 sm:p-12 lg:p-16">
              {/* Header */}
              <div className="text-center max-w-2xl mx-auto mb-8 sm:mb-12">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#E9FBE9] text-[#0D720D] text-xs font-semibold tracking-wider uppercase rounded-full mb-4 sm:mb-5">
                  <Percent className="w-3 h-3" /> Programa de Recompensas
                </span>
                <h2 className="text-2xl md:text-4xl font-bold text-[#1a1a1a] tracking-tight leading-tight">
                  Cada compra te hace crecer
                </h2>
                <p className="text-sm sm:text-base text-[#6b6b6b] mt-3 sm:mt-4 leading-relaxed">
                  Genera <strong className="text-[#0E7A0E]">recompensas del 5% al 20%</strong> en cada pedido
                  y canjéalas por marketing digital, fotografía profesional y desarrollo web.
                  Sin costo extra — solo crecimiento.
                </p>
              </div>

              {/* Illustration: loyalty tiers — responsive SVG */}
              <div className="flex justify-center mb-10 sm:mb-14 px-2" aria-hidden="true">
                <svg viewBox="0 0 520 170" className="w-full max-w-lg h-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* --- Tier labels --- */}
                  <text x="62" y="16" textAnchor="middle" fill="#0E7A0E" fillOpacity="0.45" fontFamily="system-ui, sans-serif" fontWeight="600" fontSize="9">NIVEL 1</text>
                  <text x="182" y="16" textAnchor="middle" fill="#0E7A0E" fillOpacity="0.55" fontFamily="system-ui, sans-serif" fontWeight="600" fontSize="9">NIVEL 2</text>
                  <text x="302" y="16" textAnchor="middle" fill="#0E7A0E" fillOpacity="0.65" fontFamily="system-ui, sans-serif" fontWeight="600" fontSize="9">NIVEL 3</text>
                  <text x="422" y="16" textAnchor="middle" fill="#0E7A0E" fillOpacity="0.85" fontFamily="system-ui, sans-serif" fontWeight="600" fontSize="9">NIVEL 4</text>

                  {/* ============ TIER 1: tiny restaurant ============ */}
                  <rect x="28" y="92" width="52" height="48" rx="3" fill="#E9FBE9" stroke="#0E7A0E" strokeWidth="1" opacity="0.7" />
                  <polygon points="24,92 54,74 84,92" fill="#0E7A0E" fillOpacity="0.1" stroke="#0E7A0E" strokeWidth="1" strokeOpacity="0.3" />
                  <rect x="64" y="76" width="7" height="14" rx="1" fill="#0E7A0E" fillOpacity="0.15" stroke="#0E7A0E" strokeWidth="0.7" opacity="0.25" />
                  <circle cx="67.5" cy="72" r="2" fill="#0E7A0E" fillOpacity="0.1" />
                  <circle cx="70" cy="68" r="2.5" fill="#0E7A0E" fillOpacity="0.08" />
                  <path d="M24 106 Q28 100 32 106 Q36 100 40 106 Q44 100 48 106 Q52 100 56 106 Q60 100 64 106 Q68 100 72 106 Q76 100 80 106" fill="#3CC73C" fillOpacity="0.2" stroke="#0E7A0E" strokeWidth="0.6" opacity="0.3" />
                  <rect x="38" y="114" width="14" height="26" rx="7" fill="#0E7A0E" fillOpacity="0.15" stroke="#0E7A0E" strokeWidth="0.6" opacity="0.3" />
                  <rect x="41" y="120" width="8" height="6" rx="1" fill="white" fillOpacity="0.6" />
                  <rect x="58" y="100" width="14" height="14" rx="2" fill="white" fillOpacity="0.5" stroke="#0E7A0E" strokeWidth="0.6" opacity="0.25" />
                  <line x1="65" y1="100" x2="65" y2="114" stroke="#0E7A0E" strokeWidth="0.5" opacity="0.2" />
                  <line x1="58" y1="107" x2="72" y2="107" stroke="#0E7A0E" strokeWidth="0.5" opacity="0.2" />
                  <rect x="38" y="86" width="30" height="8" rx="2" fill="#0E7A0E" fillOpacity="0.12" />
                  <line x1="53" y1="86" x2="53" y2="80" stroke="#0E7A0E" strokeWidth="0.5" opacity="0.15" />
                  <polygon points="54,44 56,50 62,50 57,54 59,60 54,56 49,60 51,54 46,50 52,50" fill="#3CC73C" fillOpacity="0.35" />
                  <rect x="40" y="62" width="28" height="13" rx="6" fill="#0E7A0E" fillOpacity="0.1" />
                  <text x="54" y="71" textAnchor="middle" fill="#0E7A0E" fillOpacity="0.55" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="8">5%</text>

                  <path d="M86 118 L108 118" stroke="#0E7A0E" strokeWidth="1" strokeDasharray="3 3" opacity="0.2" />
                  <polygon points="110,118 106,115 106,121" fill="#0E7A0E" fillOpacity="0.2" />

                  {/* ============ TIER 2 ============ */}
                  <rect x="118" y="78" width="60" height="62" rx="3" fill="#E9FBE9" stroke="#0E7A0E" strokeWidth="1" opacity="0.8" />
                  <polygon points="114,78 148,58 182,78" fill="#0E7A0E" fillOpacity="0.13" stroke="#0E7A0E" strokeWidth="1" strokeOpacity="0.35" />
                  <rect x="156" y="62" width="8" height="16" rx="1" fill="#0E7A0E" fillOpacity="0.18" stroke="#0E7A0E" strokeWidth="0.7" opacity="0.3" />
                  <circle cx="160" cy="58" r="2.5" fill="#0E7A0E" fillOpacity="0.1" />
                  <circle cx="164" cy="53" r="3" fill="#0E7A0E" fillOpacity="0.07" />
                  <path d="M114 92 Q118 86 122 92 Q126 86 130 92 Q134 86 138 92 Q142 86 146 92 Q150 86 154 92 Q158 86 162 92 Q166 86 170 92 Q174 86 178 92 Q182 86 186 92" fill="#3CC73C" fillOpacity="0.28" stroke="#0E7A0E" strokeWidth="0.7" opacity="0.35" />
                  <rect x="130" y="104" width="15" height="36" rx="7.5" fill="#0E7A0E" fillOpacity="0.2" stroke="#0E7A0E" strokeWidth="0.6" opacity="0.35" />
                  <rect x="133" y="110" width="9" height="8" rx="1" fill="white" fillOpacity="0.65" />
                  <rect x="154" y="88" width="14" height="14" rx="2" fill="white" fillOpacity="0.55" stroke="#0E7A0E" strokeWidth="0.6" opacity="0.3" />
                  <line x1="161" y1="88" x2="161" y2="102" stroke="#0E7A0E" strokeWidth="0.5" opacity="0.25" />
                  <line x1="154" y1="95" x2="168" y2="95" stroke="#0E7A0E" strokeWidth="0.5" opacity="0.25" />
                  <rect x="132" y="73" width="32" height="9" rx="2.5" fill="#0E7A0E" fillOpacity="0.15" />
                  <line x1="148" y1="73" x2="148" y2="66" stroke="#0E7A0E" strokeWidth="0.5" opacity="0.2" />
                  <polygon points="132,34 134,40 140,40 135,44 137,50 132,46 127,50 129,44 124,40 130,40" fill="#3CC73C" fillOpacity="0.45" />
                  <polygon points="164,34 166,40 172,40 167,44 169,50 164,46 159,50 161,44 156,40 162,40" fill="#3CC73C" fillOpacity="0.45" />
                  <rect x="130" y="52" width="36" height="13" rx="6" fill="#0E7A0E" fillOpacity="0.12" />
                  <text x="148" y="61" textAnchor="middle" fill="#0E7A0E" fillOpacity="0.6" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="8">10%</text>

                  <path d="M184 110 L206 110" stroke="#3CC73C" strokeWidth="1" strokeDasharray="3 3" opacity="0.25" />
                  <polygon points="208,110 204,107 204,113" fill="#3CC73C" fillOpacity="0.25" />

                  {/* ============ TIER 3 ============ */}
                  <rect x="216" y="62" width="72" height="78" rx="3" fill="#E9FBE9" stroke="#0E7A0E" strokeWidth="1" opacity="0.9" />
                  <polygon points="210,62 252,38 294,62" fill="#0E7A0E" fillOpacity="0.16" stroke="#0E7A0E" strokeWidth="1" strokeOpacity="0.4" />
                  <rect x="264" y="44" width="9" height="18" rx="1" fill="#0E7A0E" fillOpacity="0.2" stroke="#0E7A0E" strokeWidth="0.7" opacity="0.35" />
                  <circle cx="268.5" cy="40" r="3" fill="#0E7A0E" fillOpacity="0.12" />
                  <circle cx="273" cy="34" r="3.5" fill="#0E7A0E" fillOpacity="0.08" />
                  <path d="M210 78 Q214 72 218 78 Q222 72 226 78 Q230 72 234 78 Q238 72 242 78 Q246 72 250 78 Q254 72 258 78 Q262 72 266 78 Q270 72 274 78 Q278 72 282 78 Q286 72 290 78 Q294 72 298 78" fill="#3CC73C" fillOpacity="0.35" stroke="#0E7A0E" strokeWidth="0.8" opacity="0.4" />
                  <rect x="232" y="96" width="13" height="44" rx="6.5" fill="#0E7A0E" fillOpacity="0.25" stroke="#0E7A0E" strokeWidth="0.7" opacity="0.4" />
                  <rect x="236" y="102" width="7" height="10" rx="1" fill="white" fillOpacity="0.7" />
                  <rect x="248" y="96" width="13" height="44" rx="6.5" fill="#0E7A0E" fillOpacity="0.25" stroke="#0E7A0E" strokeWidth="0.7" opacity="0.4" />
                  <rect x="252" y="102" width="7" height="10" rx="1" fill="white" fillOpacity="0.7" />
                  <rect x="266" y="74" width="14" height="14" rx="2" fill="white" fillOpacity="0.6" stroke="#0E7A0E" strokeWidth="0.7" opacity="0.35" />
                  <line x1="273" y1="74" x2="273" y2="88" stroke="#0E7A0E" strokeWidth="0.5" opacity="0.3" />
                  <line x1="266" y1="81" x2="280" y2="81" stroke="#0E7A0E" strokeWidth="0.5" opacity="0.3" />
                  <rect x="238" y="58" width="36" height="9" rx="3" fill="#0E7A0E" fillOpacity="0.2" />
                  <line x1="256" y1="58" x2="256" y2="50" stroke="#0E7A0E" strokeWidth="0.6" opacity="0.25" />
                  <polygon points="224,22 226,27 231,27 227,30 229,35 224,32 219,35 221,30 217,27 222,27" fill="#3CC73C" fillOpacity="0.55" />
                  <polygon points="252,22 254,27 259,27 255,30 257,35 252,32 247,35 249,30 245,27 250,27" fill="#3CC73C" fillOpacity="0.55" />
                  <polygon points="280,22 282,27 287,27 283,30 285,35 280,32 275,35 277,30 273,27 278,27" fill="#3CC73C" fillOpacity="0.55" />
                  <rect x="236" y="38" width="40" height="14" rx="7" fill="#0E7A0E" fillOpacity="0.15" />
                  <text x="256" y="48" textAnchor="middle" fill="#0E7A0E" fillOpacity="0.65" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="8">15%</text>

                  <path d="M294 103 L316 103" stroke="#3CC73C" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.3" />
                  <polygon points="318,103 314,100 314,106" fill="#3CC73C" fillOpacity="0.3" />

                  {/* ============ TIER 4: grand restaurant ============ */}
                  <rect x="326" y="44" width="84" height="96" rx="4" fill="#E9FBE9" stroke="#0E7A0E" strokeWidth="1.2" opacity="1" />
                  <polygon points="320,44 368,18 416,44" fill="#0E7A0E" fillOpacity="0.2" stroke="#0E7A0E" strokeWidth="1.2" strokeOpacity="0.45" />
                  <rect x="384" y="24" width="10" height="22" rx="1.5" fill="#0E7A0E" fillOpacity="0.25" stroke="#0E7A0E" strokeWidth="0.8" opacity="0.4" />
                  <circle cx="389" cy="20" r="3.5" fill="#0E7A0E" fillOpacity="0.14" />
                  <circle cx="394" cy="13" r="4" fill="#0E7A0E" fillOpacity="0.1" />
                  <path d="M320 64 Q325 57 330 64 Q335 57 340 64 Q345 57 350 64 Q355 57 360 64 Q365 57 370 64 Q375 57 380 64 Q385 57 390 64 Q395 57 400 64 Q405 57 410 64 Q415 57 420 64" fill="#3CC73C" fillOpacity="0.42" stroke="#0E7A0E" strokeWidth="0.9" opacity="0.5" />
                  <rect x="344" y="94" width="14" height="46" rx="7" fill="#0E7A0E" fillOpacity="0.3" stroke="#0E7A0E" strokeWidth="0.7" opacity="0.45" />
                  <rect x="348" y="100" width="8" height="14" rx="1.5" fill="white" fillOpacity="0.75" />
                  <rect x="362" y="94" width="14" height="46" rx="7" fill="#0E7A0E" fillOpacity="0.3" stroke="#0E7A0E" strokeWidth="0.7" opacity="0.45" />
                  <rect x="366" y="100" width="8" height="14" rx="1.5" fill="white" fillOpacity="0.75" />
                  <rect x="384" y="68" width="16" height="16" rx="2.5" fill="white" fillOpacity="0.65" stroke="#0E7A0E" strokeWidth="0.7" opacity="0.4" />
                  <line x1="392" y1="68" x2="392" y2="84" stroke="#0E7A0E" strokeWidth="0.5" opacity="0.3" />
                  <line x1="384" y1="76" x2="400" y2="76" stroke="#0E7A0E" strokeWidth="0.5" opacity="0.3" />
                  <rect x="348" y="68" width="14" height="14" rx="2" fill="white" fillOpacity="0.6" stroke="#0E7A0E" strokeWidth="0.7" opacity="0.35" />
                  <line x1="355" y1="68" x2="355" y2="82" stroke="#0E7A0E" strokeWidth="0.5" opacity="0.3" />
                  <rect x="348" y="40" width="40" height="10" rx="3" fill="#0E7A0E" fillOpacity="0.25" />
                  <line x1="368" y1="40" x2="368" y2="30" stroke="#0E7A0E" strokeWidth="0.6" opacity="0.3" />
                  <polygon points="340,8 341.5,12.5 346,12.5 342.5,15 344,19.5 340,17 336,19.5 337.5,15 334,12.5 338.5,12.5" fill="#3CC73C" fillOpacity="0.6" />
                  <polygon points="368,8 369.5,12.5 374,12.5 370.5,15 372,19.5 368,17 364,19.5 365.5,15 362,12.5 366.5,12.5" fill="#3CC73C" fillOpacity="0.6" />
                  <polygon points="396,8 397.5,12.5 402,12.5 398.5,15 400,19.5 396,17 392,19.5 393.5,15 390,12.5 394.5,12.5" fill="#3CC73C" fillOpacity="0.6" />
                  <path d="M360 15 L363 4 L366 12 L370 6 L373 12 L376 6 L380 12 L383 4 L386 15" fill="#3CC73C" fillOpacity="0.75" />
                  <rect x="358" y="15" width="30" height="6" rx="1.5" fill="#3CC73C" fillOpacity="0.6" />
                  <rect x="352" y="23" width="42" height="15" rx="7.5" fill="#0E7A0E" fillOpacity="0.18" />
                  <text x="373" y="33" textAnchor="middle" fill="#0E7A0E" fillOpacity="0.75" fontFamily="system-ui, sans-serif" fontWeight="700" fontSize="9">20%</text>

                  {/* --- Bottom growth line --- */}
                  <line x1="54" y1="148" x2="410" y2="148" stroke="#0E7A0E" strokeWidth="0.6" opacity="0.06" />
                  <circle cx="54" cy="148" r="2.5" fill="#0E7A0E" fillOpacity="0.2" />
                  <circle cx="148" cy="148" r="2.5" fill="#0E7A0E" fillOpacity="0.3" />
                  <circle cx="256" cy="148" r="2.5" fill="#0E7A0E" fillOpacity="0.4" />
                  <circle cx="373" cy="148" r="3" fill="#0E7A0E" fillOpacity="0.5" />
                </svg>
              </div>

              {/* Steps — elegant row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8 sm:mb-12">
                {[
                  { step: "01", title: "Compra", desc: "Tus insumos al mejor precio de mayoreo." },
                  { step: "02", title: "Acumula", desc: "5% al 20% en Créditos por cada pedido." },
                  { step: "03", title: "Canjea", desc: "Marketing, fotografía, web y más." },
                  { step: "04", title: "Crece", desc: "Sube de nivel y gana más recompensas." },
                ].map((card) => (
                  <div key={card.step} className="flex items-center gap-3 sm:block sm:text-center group p-2 sm:p-0">
                    <span className="shrink-0 block text-[#0E7A0E] text-xs font-mono font-bold tracking-widest sm:mb-3 group-hover:text-[#0E7A0E] transition-colors sm:text-center w-6 sm:w-auto">
                      {card.step}
                    </span>
                    <div className="sm:text-center">
                      <h3 className="font-bold text-[#242529] sm:text-lg mb-0.5 sm:mb-1.5">
                        {card.title}
                      </h3>
                      <p className="text-sm text-[#6b6b6b] leading-relaxed">{card.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA */}
              <div className="text-center pt-6 sm:pt-8 border-t border-[#f0ede5]">
                <p className="text-[13px] sm:text-sm text-[var(--text-secondary)] mb-4">Más de 500 restaurantes y hoteles ya surten con nosotros</p>
                <Link
                  href="/recompensas"
                  className="btn-pill btn-pill-primary inline-flex items-center justify-center gap-2 text-sm sm:text-base px-6 sm:px-8 py-2.5 sm:py-3 w-full sm:w-auto"
                >
                  Descubre tu poder de recompensas
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
  )
}
