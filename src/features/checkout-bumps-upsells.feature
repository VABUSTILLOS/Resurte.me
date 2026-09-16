# language: es
# =============================================================
# Checkout de alta conversión — Bumps + Upsells 1-click
#
# Historias BDD (Given/When/Then) que verifican que la funcionalidad
# EXISTENTE de creación de órdenes no se rompe al integrar bumps y
# upsells. Cada escenario mapea a una prueba Vitest/Playwright.
# =============================================================

Característica: Checkout drawer con order bumps y upsells 1-click

  Antecedentes:
    Dado que la tienda opera con envío gratis desde $500 MXN
    Y una ventana de 3 order bumps simultáneos como máximo
    Y todas las ofertas que apliquen al carrito disponibles para el checkout encadenado

  # -----------------------------------------------------------
  # Retrocompatibilidad estricta (regla 1)
  # -----------------------------------------------------------

  Escenario: Orden estándar sin bumps ni upsells (retrocompatibilidad)
    Dado un carrito con artículos normales
    Cuando se crea la orden vía POST /api/orders
    Entonces la respuesta sigue el contrato actual de órdenes
    Y todos los order_items tienen item_type 'standard'
    Y no se crean registros en order_upsells

  # -----------------------------------------------------------
  # Envío gratis (barra de progreso)
  # -----------------------------------------------------------

  Escenario: Envío gratis al alcanzar el umbral
    Dado un carrito con subtotal de $499.99
    Cuando se calcula el envío
    Entonces el delivery_fee es $125
    Y la barra de progreso muestra "Agrega $0.01 más para envío gratis"

  Escenario: Envío gratis al superar el umbral
    Dado un carrito con subtotal de $500
    Cuando se calcula el envío
    Entonces el delivery_fee es $0
    Y la barra de progreso muestra "🎉 Tienes envío gratis"

  # -----------------------------------------------------------
  # Order bumps condicionales (lógica ThriveCart)
  # -----------------------------------------------------------

  Escenario: Bump de empaque térmico para perecederos
    Dado un carrito que contiene frutas-verduras o lácteos
    Cuando se consulta POST /api/cart/bumps
    Entonces se ofrece el bump de empaque térmico con hielera
    Y su precio incluye el descuento de la bump_rule

  Escenario: Bump de impulso para botanas/bebidas
    Dado un carrito que contiene bebidas o botanas-dulces
    Cuando se consulta POST /api/cart/bumps
    Entonces se ofrece el producto complementario de impulso

  Escenario: Bump de bolsa reutilizable por umbral
    Dado un carrito con subtotal mayor o igual al mínimo configurado
    Cuando se consulta POST /api/cart/bumps
    Entonces se ofrece la bolsa reutilizable de alta resistencia

  Escenario: Todas las reglas disparadas aportan su bump, sin tope artificial
    Dado un carrito que dispara las tres reglas a la vez
    Cuando se consulta POST /api/cart/bumps
    Entonces se devuelven exactamente 3 bumps
    Y cada bump corresponde a un producto distinto

  Escenario: Bump no duplica producto ya en carrito
    Dado que el producto del bump ya está en el carrito
    Cuando se consulta POST /api/cart/bumps
    Entonces ese bump se excluye de las ofertas

  # -----------------------------------------------------------
  # Cross-sell inteligente por recetas/colecciones (motor híbrido)
  # -----------------------------------------------------------

  Escenario: Bump sugerido por colección/receta con badge
    Dado un carrito con ingredientes etiquetados de la colección "taquerias-antojitos"
    Cuando se consulta POST /api/cart/bumps
    Entonces se ofrece el bump de la colección con badge "Sugerido para tu receta / pedido"
    Y su precio incluye el descuento de la bump_rule
    Y los bumps de colección/receta se listan antes que los de categoría

  Escenario: Exclusión estricta en el motor de recomendación
    Dado que el producto candidato está agotado, oculto (is_visible = false) o ya está en el carrito
    Cuando se consulta POST /api/cart/bumps
    Entonces ese bump NO se ofrece
    Y los bumps devueltos están en stock, visibles y fuera del carrito

  Escenario: Prioridad de recetas con todas las reglas aplicables
    Dado un carrito que dispara varias reglas de categoría y de colección a la vez
    Cuando se consulta POST /api/cart/bumps
    Entonces se devuelven todas las reglas que apliquen al carrito
    Y cada bump corresponde a un producto distinto

  # -----------------------------------------------------------
  # Afinidad por ingrediente + nombres reales del catálogo
  # -----------------------------------------------------------

  Escenario: La tarjeta muestra el nombre real del producto, no un título adorno
    Dado un bump cuya bump_rule tiene el título "Limón para tus mariscos"
    Y el producto del catálogo se llama "Limón"
    Cuando se consulta POST /api/cart/bumps
    Entonces el encabezado de la tarjeta es "Limón"
    Y el título de la regla solo se usa como subtítulo explicativo

  Escenario: Afinidad automática desde el recetario
    Dado un carrito con "Cebolla Blanca"
    Y el recetario incluye una receta que usa cebolla y jitomate
    Cuando se consulta POST /api/cart/bumps
    Entonces se ofrece "Jitomate Bola" con el motivo "Para tu receta de {receta}"
    Y ese bump aparece antes que los de categoría

  Escenario: Afinidad curada por el admin tiene prioridad sobre la de receta
    Dado un par curado "Cebolla Blanca" -> "Chile Serrano" en bump_affinity
    Cuando se consulta POST /api/cart/bumps
    Entonces el motivo del bump es "Ideal con Cebolla Blanca"
    Y su badge es "Ideal con tu pedido"

  Escenario: La afinidad nunca duplica ni sugiere lo que ya está en el carrito
    Dado un candidato afín que ya está en el carrito
    Y un producto alcanzado a la vez por el recetario y por un par curado
    Cuando se consulta POST /api/cart/bumps
    Entonces el producto del carrito NO se ofrece
    Y el producto alcanzado por ambas vías se ofrece una sola vez

  Escenario: El tier de afinidad es tolerante a fallos
    Dado que la tabla bump_affinity todavía no existe (migración 00112 sin aplicar)
    Cuando se consulta POST /api/cart/bumps
    Entonces la respuesta no falla
    Y se siguen ofreciendo los bumps de receta y de categoría

  Escenario: Las reglas de afinidad no se filtran a upsells ni a descuentos 1-click
    Dado una bump_rule con trigger_type "ingredient_affinity"
    Cuando se consultan las ofertas de upsell o se cotiza un upsell 1-click
    Entonces esa regla se excluye de ambos resultados

  # -----------------------------------------------------------
  # Encadenado de bumps + cantidades editables (checkout)
  # -----------------------------------------------------------

  Escenario: Un bump elegido entra al pedido y aparece el siguiente
    Dado un checkout con el pool de bumps solicitado (limit 12)
    Cuando el usuario agrega un order bump
    Entonces su tarjeta desaparece de la lista de ofertas
    Y ese bump aparece como artículo del pedido con cantidad 1
    Y se revela la siguiente oferta del pool en su lugar
    Y nunca se muestran más de 3 tarjetas a la vez
    Y el ciclo se repite mientras queden ofertas disponibles

  Escenario: El pool agotado deja de ofrecer bumps
    Dado que el usuario ya agregó todos los bumps disponibles
    Cuando se revisa la lista de ofertas
    Entonces no se revela ninguna oferta nueva
    Y la sección de ofertas del checkout desaparece
    Y el pedido conserva todos los bumps ya agregados

  Escenario: Un bump agregado se ajusta desde la lista del pedido
    Dado un bump ya agregado al pedido (su tarjeta ya desapareció)
    Cuando el usuario revisa la lista de artículos del pedido
    Entonces el bump figura como una línea con su cantidad y precio
    Y su cantidad se ajusta con "+" y "−" como cualquier otro artículo
    Y su cantidad baja hasta 0 (la línea queda en el pedido con etiqueta "En 0")

  Escenario: Cantidades editables con + y − en el checkout
    Dado un pedido con artículos del catálogo y bumps
    Cuando el usuario toca "+" en un artículo
    Entonces la cantidad sube 1 y el total se recalcula con la fuente única
    Y al tocar "−" la cantidad baja 1

  Escenario: Un artículo en 0 se elimina solo con confirmación
    Dado un artículo del pedido con cantidad 1
    Cuando el usuario toca "−"
    Entonces la cantidad queda en 0 y el artículo sigue visible en el pedido
    Y el total baja como si el artículo no estuviera (una sola fuente de totales)
    Y el botón "Continuar" queda deshabilitado mientras el pedido esté en 0

  Escenario: El segundo "−" en una línea en 0 pide confirmar la eliminación
    Dado un artículo del pedido con cantidad 0
    Cuando el usuario vuelve a tocar "−"
    Entonces aparece un prompt de confirmación para eliminar ese artículo
    Y si cancela, el artículo sigue en el pedido con cantidad 0
    Y si confirma, el artículo sale del pedido

  Escenario: Las líneas en 0 no viajan en el pedido
    Dado un pedido con una línea en 0 y un bump en 0
    Cuando se arma el payload de POST /api/orders
    Entonces ninguna de las dos líneas se envía
    Y el servidor no recibe cantidades 0 (rechazaría el pedido)

  Escenario: Fallback dinámico para colección sin regla admin
    Dado un carrito con una colección detectada sin regla en bump_rules
    Cuando se consulta POST /api/cart/bumps
    Entonces el motor elige un producto complementario de la colección
    Y lo registra como bump_rule de tipo recipe_collection
    Y el bump resultante pasa la validación de POST /api/orders

  # -----------------------------------------------------------
  # Upsell 1-click (lógica SamCart)
  # -----------------------------------------------------------

  Escenario: Upsell cobrado off-session con idempotencia
    Dado una orden confirmada con método de pago guardado
    Cuando se llama POST /api/checkout/process-upsell con una idempotency_key
    Entonces el cargo off-session se confirma
    Y se registra order_upsells como 'paid'
    Y los items se insertan con item_type 'upsell'

  Escenario: Clics repetidos no duplican cobros (idempotencia)
    Dado un upsell ya pagado para una idempotency_key
    Cuando se repite el mismo POST con la misma idempotency_key
    Entonces se devuelve el resultado anterior sin crear un cargo nuevo

  Escenario: Upsell requiere autenticación 3DS/SCA
    Dado que el emisor del banco exige verificación 3DS
    Cuando se procesa el upsell
    Entonces se devuelve { status: 'requires_action', clientSecret }
    Y el modal ejecuta confirmPayment para completar la verificación

  Escenario: Upsell declinado no afecta la orden base
    Dado un cargo off-session declinado
    Cuando el usuario acepta el upsell
    Entonces se devuelve un error 4xx
    Y la orden principal permanece 'paid'/'confirmed'
    Y se ofrece el downsell o la confirmación final

  Escenario: Reconciliación 3DS sin doble cobro
    Dado un intent en requires_action que Stripe ya marcó succeeded
    Cuando llega el retorno del 3DS
    Entonces se marca el upsell 'paid' e inserta items
    Y no se crea un cargo nuevo

  Escenario: Total de la orden base congelado
    Dado un upsell pagado correctamente
    Cuando se consulta la orden
    Entonces orders.total no cambia
    Y el monto del upsell vive en order_upsells.amount
    Y el resumen consolidado es orders.total + suma de upsells pagados

  # -----------------------------------------------------------
  # Método de pago guardado (setup_future_usage)
  # -----------------------------------------------------------

  Escenario: Consentimiento de guardado habilita el upsell
    Dado que el cliente acepta guardar su tarjeta
    Cuando se crea el PaymentIntent principal
    Entonces se usa payment_method_options.card.setup_future_usage 'off_session'
    Y la orden persiste stripe_payment_method_id y stripe_customer_id

  Escenario: Pago con wallet no es reutilizable off-session
    Dado que el pago base se hizo con Apple Pay / Google Pay / Link
    Cuando se intenta el upsell 1-click
    Entonces se rechaza con 409 "No hay método de pago guardado"
    Y la orden base permanece intacta

  # -----------------------------------------------------------
  # Captura de leads (onBlur + exit-intent)
  # -----------------------------------------------------------

  Escenario: Captura de email al salir del campo
    Dado que el usuario escribe su email en el paso de dirección
    Cuando el campo pierde el foco (onBlur)
    Entonces se registra el lead con source 'checkout_drawer'
    Y el checkout no se interrumpe (fail-open)

  Escenario: Exit-intent dispara cupón de recuperación
    Dado un carrito con artículos
    Cuando el usuario intenta salir de la página (mouseout superior o visibilitychange)
    Entonces se muestra el modal de recuperación
    Y el email se registra con source 'exit_intent'
    Y el cupón configurado se aplica al carrito si es válido
