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
    Y un máximo de 3 order bumps simultáneos

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
    Entonces el delivery_fee es $35
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

  Escenario: Máximo 3 bumps simultáneos
    Dado un carrito que dispara las tres reglas a la vez
    Cuando se consulta POST /api/cart/bumps
    Entonces se devuelven exactamente 3 bumps
    Y cada bump corresponde a un trigger_type distinto

  Escenario: Bump no duplica producto ya en carrito
    Dado que el producto del bump ya está en el carrito
    Cuando se consulta POST /api/cart/bumps
    Entonces ese bump se excluye de las ofertas

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
