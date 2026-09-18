# Credenciales externas — dónde se consigue cada una

> Guía de **obtención** de las credenciales que hoy bloquean capacidades del
> sitio. Complementa a `.env.local.example` (que dice **cómo se usa** cada
> variable) y a `docs/OPS.md` (que dice **cómo se opera**). Este documento
> responde una sola pregunta: **¿de dónde saco esto?**
>
> Las cuatro filas del backlog que dependían de un tercero estaban listadas en
> `docs/AUDITORIA-ESTATUS.md:427` **sin URL**. Aquí van con su origen, su costo,
> su tiempo y su comando de verificación.
>
> **Tres de los ocho pendientes no necesitan comprar nada.** Se dice en cada
> sección en vez de mandarte a buscar una credencial que no existe (ver §6).

---

## 0. Lo urgente no es conseguir: es revocar

Antes de la lista, el único punto de esta guía con **riesgo vivo**.

`docs/OPS.md §3` («Contraseña de Postgres: rotación pendiente») documenta que
`supabase/.temp/pooler-url` —estado local que
genera el CLI de Supabase— contiene la cadena de conexión del rol **`postgres`
(superusuario) con contraseña en claro**, y que **estuvo versionado en el
repositorio público** `VABUSTILLOS/Resurte.me` durante **6 commits** desde
`2bee041`. Un único blob ⇒ **la contraseña nunca se rotó**. Da acceso total a la
base de producción: pedidos, direcciones y datos de clientes.

Ya está destrackeado y en `.gitignore`, pero **eso no revoca nada**: el historial
está indexado y el secreto debe considerarse comprometido.

| Paso | Dónde | Qué hacer |
|---|---|---|
| 1 | Supabase Dashboard → *Project Settings* → *Database* → **Reset database password** | Rotar **ya**. Es la única mitigación real. |
| 2 | Vercel → Settings → Environment Variables | Actualizar `POSTGRES_PASSWORD` y `POSTGRES_URL*` con la contraseña nueva. |
| 3 | *(opcional)* `git filter-repo --path supabase/.temp/ --invert-paths` + force-push coordinado | Limpiar el historial **después** de rotar, no en lugar de rotar. |

**Regla permanente:** nada de `supabase/.temp/` ni de `.env*` en git. El CLI
regenera `supabase/.temp/` en cada `supabase link`.

---

## 1. Stripe

### 1.1 Stripe Connect — cobros por restaurante

**Qué es.** Un interruptor de plataforma, no una llave: enruta los cargos con
tarjeta de FoodOS a la **cuenta Express del restaurante** (destination charge) en
vez de a la cuenta de Resurte.me. Sin esto, el dinero cae en la plataforma y el
pago al restaurante se hace a mano.

**Dónde se consigue.**

1. `https://dashboard.stripe.com` → **Settings → Connect** → completar el
   *perfil de la plataforma* y activar Connect.
2. Definir la variable en Vercel (o `.env.local`):

```bash
STRIPE_CONNECT_ENABLED=true      # exactamente "true" o "1"; cualquier otra cosa lo deja apagado
STRIPE_CONNECT_COUNTRY=MX        # país de las cuentas Express (ISO-2), por defecto MX
```

**Costo.** Connect **no tiene cuota de alta**: se paga por operación con las
tarifas vigentes para México. La comisión de plataforma es
`foodos_restaurants.platform_fee_percent`, **por defecto `0`** — o sea, activar
Connect no te cobra automáticamente nada al restaurante.

**Disponibilidad en México — verificada.** `https://docs.stripe.com/connect/express-accounts`
lista **México** entre los países cuyos negocios pueden crear cuentas Express. La
plataforma y las cuentas conectadas quedan en la **misma región** (`MX`), que es
el requisito de las transferencias cuando no hay saldo transfronterizo
(`https://docs.stripe.com/connect/account-capabilities`).

**Variables.** `STRIPE_CONNECT_ENABLED`, `STRIPE_CONNECT_COUNTRY`.
`STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` **ya están configuradas**: Connect
no pide credenciales nuevas, sólo la activación.

**Qué desbloquea.** `w1-connect-test-mode`, `w1-connect-pilot`, `w1-connect-prod`
y la fila **P1** del backlog (`docs/AUDITORIA-ESTATUS.md:412`) y la debilidad
**#1** (`docs/AUDITORIA-ESTATUS.md:384`: «el dinero del restaurante no llega al
restaurante»).

**Cómo se verifica.** `/panel/foodos/restaurante` → sección **«Conectar mis
cobros»**. El ciclo completo son 6 pasos (dueño → `startConnectOnboarding()` →
formulario de Stripe → `?connect=done` → webhook `account.updated` →
`syncConnectAccount()`); están en `docs/OPS.md §11`. En modo test:
`STRIPE_CONNECT_ENABLED=true` con las llaves `sk_test_`/`whsec_`.

> ⚠️ **El rollout es por restaurante, no global.** `buildDestinationChargeParams()`
> devuelve `{}` —cargo contra la plataforma— si el flag está apagado, si no hay
> `stripe_account_id`, si `stripe_charges_enabled`/`stripe_payouts_enabled` están
> en `false`, o si Stripe reporta `requirements.disabled_reason`. Encender el flag
> **no** rompe a los restaurantes que aún no se han conectado: siguen cobrando
> contra la plataforma. Es una migración gradual por diseño.

> ⚠️ **Seguridad.** La migración `00085` hace `REVOKE UPDATE` **a nivel de
> columna** de las 7 columnas `stripe_*` y `platform_fee_percent` sobre
> `authenticated` y `anon`, porque la política RLS de `foodos_restaurants` es a
> nivel de fila: sin eso, un dueño podría desviar los pagos de sus comensales.
> **No agregar esas columnas a `upsertRestaurant()` ni a ningún payload
> construido desde el cliente.**

> 🔜 **Deuda, no bloqueo.** `src/lib/stripe-connect.ts` usa **cuentas Express de
> la API Accounts v1**, que la propia documentación de Stripe marca como
> *«funcionalidad obsoleta»* y sustituye por **Accounts v2** o por propiedades de
> controlador (`https://docs.stripe.com/connect/accounts-v2`). Funciona hoy;
> migrar es trabajo futuro, no un requisito para encender Connect.

### 1.2 OXXO / SPEI / CoDi

**Qué es.** Métodos de pago asíncronos mexicanos. El código **ya soporta el ciclo
completo** (`docs/OPS.md §9`, «Métodos de pago locales asíncronos»); activarlos es
un cambio de configuración.

**Dónde se consigue.** `https://dashboard.stripe.com` → **Settings → Payment
methods** → activar `OXXO`, `SPEI` y/o `CoDi`. Requiere cuenta Stripe con
**entidad mexicana** y **MXN** como moneda de liquidación. **Repetir en modo test
y en modo live: son configuraciones separadas.**

**Costo.** Por operación, según la tarifa vigente de Stripe MX para cada método.

**Variables.** **Ninguna.** El `PaymentIntent` se crea con
`automatic_payment_methods: { enabled: true }` en `src/lib/payments.ts`, así que
el método aparece en el formulario en cuanto la cuenta lo tenga activo, **sin
desplegar código**.

> ⚠️ **No confundir con `NEXT_PUBLIC_SPEI_CLABE` / `NEXT_PUBLIC_OXXO_REFERENCIA`.**
> Aquellas son para el **flujo manual** (el admin confirma el cobro a mano) y son
> **tus propios datos**, no credenciales de un tercero: tu CLABE y tu referencia.
> Éstas de Stripe son el flujo **automático**. Son caminos distintos y hoy el
> manual es el que está configurado.

**Qué desbloquea.** La fila **A1** (`docs/AUDITORIA-ESTATUS.md:428`).

**Cómo se verifica.** Pedido en `/r/<slug>` → **Tarjeta** → elegir OXXO. En test
existe el ciclo completo con voucher simulado. La tabla de eventos → estado
(`processing` → `paid` / `expired`) está en `docs/OPS.md §9` («Métodos de pago
locales asíncronos»).

---

## 2. Wallet — tarjeta de lealtad en el teléfono

Wallet es de **plataforma** (una cuenta para todos los restaurantes), igual que
el SMS y Uber Direct: es el pase de Resurte con la marca del restaurante encima.

> ✅ **Sin credenciales no se rompe nada.** La tarjeta web
> (`/r/[slug]/tarjeta/[token]` con su QR) hace todo el trabajo y los botones de
> «añadir al teléfono» simplemente no aparecen. Las rutas
> `/api/foodos/wallet/[token]/apple` y `/google` responden **501** en vez de
> servir un pase roto. Esto ya está bien hecho: **no hay prisa**.

### 2.1 Apple Wallet

**Qué es.** Un `.pkpass` es un ZIP con `pass.json`, `manifest.json` (SHA-1 de
cada archivo), `signature` (PKCS#7 detached) y las imágenes. El ZIP y el
manifiesto **los producimos nosotros**; la firma no.

**Dónde se consigue.**

| Pieza | Dónde | Costo |
|---|---|---|
| **Apple Developer Program** | `https://developer.apple.com/programs/` | **99 USD/año** |
| **Pass Type ID** | `https://developer.apple.com/account/resources/identifiers` → *Identifiers* → **Pass Type ID** (`pass.com.resurte.me.lealtad`) | incluido |
| **Certificado del pase** | Con el Pass Type ID: generar un **CSR** desde *Acceso a Llaveros* (Keychain Access) y subirlo → descargar el `.cer` → exportar el `.p12`/PEM junto con su llave privada | incluido |
| **WWDR** (certificado intermedio) | `https://www.apple.com/certificateauthority/` → *Worldwide Developer Relations* | gratis |
| **Team ID** | `https://developer.apple.com/account` → *Membership details* | incluido |

Alta con **Apple ID**. Para inscribir una **empresa** (no una persona) Apple pide
un **D-U-N-S number**; el alta puede tardar días.

**Variables.**

```bash
APPLE_WALLET_ENABLED=false        # kill switch
APPLE_WALLET_PASS_TYPE_ID=pass.com.resurte.me.lealtad
APPLE_WALLET_TEAM_ID=XXXXXXXXXX
APPLE_WALLET_CERT=-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----
APPLE_WALLET_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
APPLE_WALLET_WWDR=-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----
APPLE_WALLET_KEY_PASSPHRASE=      # solo si el .p12 exportado la traía
```

Los PEM aceptan `\n` escapados (formato de variable de entorno) o multilínea.

> 🔴 **La credencial NO basta — hay un bloqueo de arquitectura.** El docstring de
> `src/lib/foodos-wallet/apple.ts:1-16` lo dice: la firma requiere una
> implementación de **CMS/PKCS#7 que Node no trae**, así que el firmante por
> defecto invoca **`openssl smime -sign`**, «disponible en un runtime propio o en
> Docker, **no en serverless**». Si no hay firmante o falla, el pase devuelve
> `null`.
>
> **Comprar el certificado sin resolver esto da un 501 con 99 USD pagados.** La
> firma es una **interfaz inyectable** (`ApplePassSigner`): hay que decidir
> *dónde* firma —un contenedor, una función con el binario, o un servicio
> externo— **antes** de pagar la membresía.

### 2.2 Google Wallet

**Qué es.** El caso fácil: se resuelve entero con `node:crypto` (JWT RS256), sin
certificados intermedios ni CMS. `googleWalletConfig()` devuelve `null` si el
kill switch es `"false"` o si falta cualquiera de las tres piezas.

**Dónde se consigue.**

| Pieza | Dónde |
|---|---|
| **Issuer ID** | `https://pay.google.com/business/console` → *Google Wallet API* → crear un emisor. Te da el `issuerId` numérico. |
| **Cuenta de servicio** | `https://console.cloud.google.com` → *IAM & Admin* → *Service Accounts* → crear una, **habilitar la Google Wallet API** en el proyecto y darle permiso de escritura sobre el issuer. Descargar la **clave JSON**. |
| **Email + clave privada** | Del JSON descargado: `client_email` → `GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL`; `private_key` → `GOOGLE_WALLET_PRIVATE_KEY`. |

**Costo.** **Gratis.**

**Variables.**

```bash
GOOGLE_WALLET_ENABLED=false
GOOGLE_WALLET_ISSUER_ID=3388000000000000000
GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL=wallet@proyecto.iam.gserviceaccount.com
GOOGLE_WALLET_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
GOOGLE_WALLET_CLASS_SUFFIX=foodos_loyalty   # distingue varias marcas bajo el mismo issuer
```

El `classId` se envía **en línea**, así que Google crea el `loyaltyClass` si no
existe: no hay que provisionarlo a mano.

**Cómo se verifica.** El botón «añadir a Google Wallet» aparece en la tarjeta
(`/r/[slug]/tarjeta/[token]`) en cuanto las tres variables están presentes.

**Qué desbloquea.** La mitad de `w4-wallet` y la fila **P3** de
`docs/AUDITORIA-ESTATUS.md:418` («certificados de Wallet»).

> 💡 **Google es el camino barato:** gratis, sin certificados y sin el problema de
> `openssl`. Si sólo quieres una victoria rápida en Wallet, empieza por aquí.

---

## 3. CFDI — facturación electrónica

**Qué es.** La promesa pública está viva: `src/app/negocio/facturacion/page.tsx`
dice literalmente *«Nos mandas tus datos fiscales una sola vez y te emitimos tu
CFDI 4.0 cuando lo pidas. Sin costo, sin recordatorios»*. **No hay
implementación detrás.** La auditoría lo lista como debilidad **#6**
(`docs/AUDITORIA-ESTATUS.md:389`).

> ⚠️ **Ojo con la ambigüedad del panel.** Lo que el panel llama «facturas» son
> **tickets subidos para ganar créditos** (`invoice_submissions`), no CFDI. No son
> lo mismo y no comparten código.

**Dónde se consigue.** Hacen falta **dos piezas distintas**:

| Pieza | Qué es | Dónde |
|---|---|---|
| **CSD** — Certificado de Sello Digital | Tu certificado fiscal; **es tuyo**, no se compra | Portal del SAT, con tu **e.firma** o **CIEC**: `https://www.sat.gob.mx` → *Trámites* → *Certificado de Sello Digital*. Requiere RFC y régimen dados de alta y vigentes. |
| **PAC** — Proveedor Autorizado de Certificación | Quien **timbra** el CFDI ante el SAT; es el único que puede sellarlo | **Padrón oficial de PAC del SAT** (autoritativo). Comercialmente: **Facturama**, **SW Sapien** (`soyfactura.mx`), **Finkok**, **Facturapi**, **Solución Factible**, **Edicom**. |

**Cómo elegir PAC.** Compara por: **precio por timbre** (o plan mensual),
**API REST** documentada, **sandbox gratis** para probar sin gastar timbres, y
soporte de **CFDI 4.0** + **complemento de pago 2.0** (lo necesitas si cobras en
parcialidades). Casi todos ofrecen ambiente de pruebas sin costo.

**Costo.** Desde unos cientos de MXN al mes, o por timbre. El CSD es gratis.

**Variables.** **No existe ninguna todavía.** `grep` de `cfdi|timbrado|facturapi|sat|rfc`
en `src/` no devuelve resultados (verificado por la auditoría, fila `AU6`). El
track empieza por **elegir PAC**, y de ahí salen las variables — no al revés.

> 🚧 **Estos nombres son una propuesta, no una configuración existente.**
> Ninguno se lee hoy en el código, ninguno está en `.env.local.example` y no hay
> que crearlos todavía: `CFDI_PAC_API_KEY`, `CFDI_PAC_BASE_URL`, `CFDI_RFC_EMISOR`,
> `CFDI_REGIMEN_FISCAL`, más una migración para los datos fiscales del cliente.
> Se listan sólo para que se vea la forma que tendrá el track. **El contrato
> `src/lib/credenciales.contract.test.ts` los exceptúa explícitamente por eso** —
> si algún día se implementan, hay que quitar la excepción y entonces el contrato
> exigirá que estén en el código.

> 🔴 **Requisito previo que no es técnico.** Necesitas estar dado de alta en el
> SAT con RFC y régimen correctos y un CSD vigente. Además, si Resurte.me va a
> facturar **a nombre de los restaurantes**, eso es **facturación de terceros** y
> cambia el diseño (¿quién es el emisor?, ¿cómo se autoriza?, ¿quién absorbe el
> timbre?) — no sólo la credencial. **Decide el modelo fiscal antes de contratar
> un PAC.**

**Qué desbloquea.** `w4-cfdi`, la fila **C1** (`docs/AUDITORIA-ESTATUS.md:427`) y
la debilidad #6 (`docs/AUDITORIA-ESTATUS.md:389`).

**Cómo se verifica.** *(Pendiente: no hay nada que verificar hasta que exista el
track. El comando se documentará cuando se implemente.)*

---

## 4. e2e autenticado — **no se compra nada**

**Qué es.** El arnés de Playwright (`e2e/`) verifica hoy **guardas**, no flujos:
`e2e/global-setup.ts` sólo calienta rutas y no autentica. `signInAsAdmin()`
(`e2e/support/session.ts`) lee `E2E_ADMIN_EMAIL` y `E2E_ADMIN_PASSWORD`; **sin
ellas devuelve `false` y el bloque se salta solo** — nunca lanza. El propio
docstring lo justifica: *«mejor un bloque saltado y visible que un test que finge
verificar»*.

Esa decisión está bien. Lo que falta es **una cuenta de prueba**, y se crea en
**tu propio Supabase**. No hay tercero, ni costo, ni alta.

**Dónde se consigue.** La vía más corta está documentada en `docs/OPS.md §8.2`:

```bash
npm run admin create e2e@resurte.me
```

Crea una cuenta **ya confirmada** y con **rol admin**, y genera una contraseña
aleatoria de 20 caracteres que **imprime una sola vez** (en Supabase Auth sólo
queda el hash). Necesita `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`
en el entorno.

Alternativa sin CLI: Supabase Dashboard → *Authentication → Users → **Add user***
(marcando *Auto Confirm User*) y luego
`update profiles set role = 'admin' where id = '<uuid>';` (migración `00067`), o
añadir el email a `ADMIN_EMAILS`.

**Variables.**

```bash
E2E_ADMIN_EMAIL=e2e@resurte.me
E2E_ADMIN_PASSWORD=<la que imprimió el comando>
```

**Cómo se verifica.**

```bash
E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... npm run test:e2e
```

Los bloques que antes salían **saltados** deben pasar a **ejecutados**. Usa
`--reporter=line` para ver los `console.log` (los de vitest no se ven).

> 🔴 **Usa una cuenta dedicada, no la tuya.** `e2e@resurte.me` con rol admin,
> **sólo en la base de test/preview**. Nunca la reutilices en producción ni la
> compartas con tu cuenta personal: el e2e navega el panel y puede escribir datos.

**Qué desbloquea.** `w3-e2e-auth` y la fila **`AU10`**. Con sesión, los bloques
autenticados del admin y del panel dejan de saltarse. Está emparentado con la
debilidad **#5** (`docs/AUDITORIA-ESTATUS.md:388`: «el panel del restaurante no
tiene tests de superficie»), aunque esa se cubre con pruebas unitarias, no con
e2e. Faltan ~10 secciones del admin por cubrir una vez que haya sesión.

---

## 5. POS e impresión — **no hay credencial que lo desbloquee**

### 5.1 Proveedores de POS

**Qué es.** `src/lib/pos/registry.ts` declara **6 proveedores**, todos
`implemented: false`. Se declaran a propósito: el restaurantero ve que su
proveedor está contemplado y el panel explica qué falta. El docstring lo justifica
—*«Fingir una sincronización produciría un menú desincronizado en silencio, que es
peor que no ofrecerla»*—. Hoy `resolvePosAdapter()` devuelve
`unimplementedPosAdapter`, que reporta honestamente que el adaptador no existe.

**Dónde se consigue cada uno.** El panel ya muestra el enlace oficial de cada
proveedor (`docsUrl` en el registro) para que el dueño sepa **qué pedir**:

| Proveedor | Dónde pedir acceso |
|---|---|
| Soft Restaurant | `https://www.softrestaurant.com.mx/` |
| Parrot | `https://www.parrot.com.mx/` |
| NCR Aloha | `https://www.ncr.com/restaurants` |
| Toast | `https://doc.toasttab.com/` |
| Clip | `https://developer.clip.mx/` |
| Mercado Pago | `https://www.mercadopago.com.mx/developers/es/docs` |

**Credenciales: no van en variables de entorno.** El dueño las captura en
`/panel/foodos/pos` y se guardan **cifradas por fila** en `foodos_pos_connections`
(migración `00129`). Los campos marcados `secret` se enmascaran en el panel.

**Es trabajo de integración, no de compra.** Clip y Mercado Pago tienen API
pública (OAuth); Toast, NCR Aloha, Parrot y Soft Restaurant son típicamente
integraciones **de partner cerrado**, y el camino es un convenio. **No hay
credencial que puedas comprar hoy para desbloquear esto.**

**Cómo se verifica.** El webhook entrante es
`/api/foodos/pos/[provider]/webhook/[restaurantId]`, con el secreto en el header
`x-pos-secret`. **Sin secreto responde 503: es fail-closed a propósito.** El
secreto se genera con el botón «Rotar secreto» del panel.

> ✅ **El camino de entrada sin credenciales ya funciona:** la **importación CSV**
> del menú en `/panel/foodos/menu` (formato `categoria,nombre,descripcion,precio,costo,tags`).

> 📌 **Sin candado de nivel, a propósito.** `pos_integraciones` es la única
> capacidad en **Verde**: el candado existe para cobrar lo que cuesta operar, y
> hoy no hay nada que operar. Cuando el primer adaptador exista, el nivel sube
> con él.

### 5.2 Impresión ESC/POS

**Qué es.** **Nada que comprar: es una decisión de producto.** No hay credencial,
ni API, ni certificado.

**Por qué no existe el adaptador.** `src/lib/foodos-printing/types.ts:1-16`
documenta que existió un `printers.ts` con un adaptador ESC/POS declarado *«no
implementado»* sólo para que la UI lo mostrara como «próximamente», y que **la UI
nunca lo mostró**: `getPrinter`, `availablePrinters`, `printerOptions` y
`printTicket` **no tenían un solo consumidor** y el módulo se sostenía de su
propio test. **Se eliminó a propósito** —*«se eliminó en vez de dejar una promesa
que nadie ve»*. Hoy el único destino de impresión es el **diálogo del navegador**
(`/panel/foodos/pedidos/[id]/print/`).

**Lo que hace falta decidir antes de escribir código:**

1. **Hardware.** Qué impresora térmica (58 mm u 80 mm). Referencias comunes:
   Epson TM-T20III, Star TSP143.
2. **Transporte.** Un navegador **no puede** hablar con un USB/Bluetooth, y el
   servidor es **serverless**: tampoco alcanza una impresora en la LAN del
   restaurante. Las opciones reales son:
   - **(a) Diálogo del navegador** — ya funciona hoy, cero infraestructura, pero
     el dueño tiene que confirmar el diálogo en cada ticket.
   - **(b) Agente local** — un proceso en la caja (PrintNode, QZ Tray, o un
     binario propio) que recibe el ticket y habla con la impresora. Es el camino
     que da impresión automática de verdad.
   - **(c) ESC/POS crudo por red** — el agente local abre un socket a la
     impresora; el más controlable y el más trabajo.
3. **Pantalla + adaptador juntos.** El contrato se reintroduce **con la pantalla
   que lo usa, no antes**. No repitas el error del módulo sin consumidores.

**Qué desbloquea.** `w4-pos-escpos` y la fila **P2** del backlog
(`docs/AUDITORIA-ESTATUS.md:416`).

**Cómo se verifica.** *(Pendiente: no hay nada que verificar. El comando se
documentará cuando exista el adaptador.)*

---

## 6. Otras integraciones ya cableadas que hoy están apagadas

El código las soporta enteras; sólo les falta la credencial. **No son bloqueos de
ningún pendiente**, pero responden a la misma pregunta.

| Integración | Variable(s) | Dónde se consigue | Costo |
|---|---|---|---|
| **Correo transaccional** (Resend) | `RESEND_API_KEY` | `https://resend.com/api-keys` | Plan gratis limitado; luego por volumen |
| **WhatsApp Business** (Meta Cloud API) | `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_BUSINESS_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | `https://developers.facebook.com/apps/` | Por conversación |
| **Push (VAPID)** | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | **Se generan localmente**: `npx web-push generate-vapid-keys` | **Gratis** |
| **Uber Direct** | `UBER_DIRECT_ENABLED`, `UBER_DIRECT_CLIENT_ID`, `UBER_DIRECT_CLIENT_SECRET`, `UBER_DIRECT_CUSTOMER_ID`, `UBER_DIRECT_SANDBOX` | `https://developer.uber.com/` | Por entrega |
| **SMS** (Twilio) | `SMS_ENABLED`, `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | `https://console.twilio.com` | Por mensaje |
| **Kie.ai** (piloto admin) | `KIE_AI_API_KEY` *(ya configurada)* + `KIEAI_CALLBACK_URL` | `https://docs.kie.ai/` · la callback es **tu** URL pública | Por uso |
| **Asistente de IA** (OpenAI-compatible) | `OPENAI_API_KEY` | `https://platform.openai.com/api-keys` — sirve cualquier proveedor compatible cambiando `OPENAI_BASE_URL` | Por uso |
| **SMTP propio de Supabase** | *ninguna variable de la app* | Supabase Dashboard → *Project Settings* → *Authentication* → **SMTP** (`docs/OPS.md §8.1`) | Proveedor de correo |
| **SPEI / OXXO manual** | `NEXT_PUBLIC_SPEI_CLABE`, `NEXT_PUBLIC_SPEI_BENEFICIARIO`, `NEXT_PUBLIC_OXXO_REFERENCIA` | **Tus propios datos** — no son de un tercero | — |
| **Google OAuth** *(opcional)* | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `https://console.cloud.google.com` | Gratis |

> ⚠️ **El SMTP propio de Supabase es el que más importa.** El registro por email,
> el enlace mágico y la recuperación de contraseña **no funcionan** con el SMTP
> por defecto (es sólo para desarrollo y los correos no llegan). Ver `docs/OPS.md §8.1`.

**Se generan, no se compran:** `FOODOS_WA_ENCRYPTION_KEY` (cualquier cadena larga
y secreta), `CRON_SECRET` (`openssl rand -hex 32`), `ADMIN_EMAILS` (tu propio
listado).

**Estado real de cada integración:** `src/lib/integration-status.ts` es la fuente
única de verdad. `getUnconfiguredIntegrations()` devuelve las que hoy no pueden
operar, con su `impact` en español listo para el panel.

> ⚠️ **`STRIPE_CONNECT_ENABLED` no es una credencial, es un interruptor:** exige
> exactamente `"true"` o `"1"`. Poner `""` o `"yes"` la deja **apagada sin error**.
> `readEnv()` considera vacío o sólo espacios como ausente.

---

## 7. Resumen y orden recomendado

### Qué cuesta qué

| Bloqueo | Costo | Tiempo | Depende de |
|---|---|---|---|
| **Rotar Postgres** | — | minutos | **sólo tú** |
| **e2e autenticado** | **Gratis** | minutos | **sólo tú** |
| **Accesibilidad** | **Gratis** | trabajo | **nadie: ya está desbloqueado** |
| **Google Wallet** | **Gratis** | horas | **sólo tú** |
| **Stripe Connect** | Alta gratis | horas + revisión de Stripe | tú + Stripe |
| **OXXO / SPEI / CoDi** | Por operación | minutos | tú + aprobación de Stripe por método |
| **Apple Wallet** | **99 USD/año** | días (alta) | tú + Apple **+ resolver la firma** |
| **CFDI** | Cientos de MXN/mes | semanas | tú + tu situación fiscal + un PAC |
| **ESC/POS** | Hardware | trabajo | **decisión de producto** |
| **POS proveedores** | — | trabajo | convenios de partner |

### Orden recomendado

1. **Rotar la contraseña de Postgres** (§0). Riesgo vivo, minutos, sin costo.
2. **Crear el usuario de prueba del e2e** (§4). Gratis, minutos, y desbloquea la
   verificación de todo lo demás.
3. **Google Wallet** (§2.2). Gratis y sin el problema de `openssl`: la victoria
   más barata en Wallet.
4. **Stripe Connect en modo test** (§1.1). Activación + `STRIPE_CONNECT_ENABLED=true`.
   México está confirmado como país soportado.
5. **Resolver dónde firma Apple Wallet** (§2.1) **antes** de pagar los 99 USD.
   Sin eso el certificado no cambia el 501.
6. **Decidir el modelo fiscal de CFDI** (§3) antes de contratar un PAC.
7. **Decidir el transporte de impresión** (§5.2) antes de escribir el adaptador.

### Lo que **no** hay que comprar

- **Accesibilidad** (`w4-a11y`) — trabajo puro. El todo **ya está desbloqueado**:
  la nota de que dependía de un tercero era **falsa**. Cubierta por el trabajo de
  accesibilidad de la Ronda 23.
- **ESC/POS** (`w4-pos-escpos`) — hardware + decisión de transporte.
- **e2e autenticado** (`w3-e2e-auth`) — se auto-provisiona en tu Supabase.

### Lo que este documento **no** decide

No activa nada, no compra nada y no escribe código de producto. Las capacidades
apagadas siguen apagadas y **honestas**: 501 en Wallet, `implemented: false` en
POS, degradación a la tarjeta web, fail-closed sin `CRON_SECRET`. Eso ya está bien
hecho y no hay que tocarlo.

---

## Referencias

- `docs/OPS.md §3` — variables de entorno requeridas y rotación de `CRON_SECRET`.
- `docs/OPS.md §8.1` — SMTP propio de Supabase.
- `docs/OPS.md §8.2` — roles, master admin y `npm run admin`.
- `docs/OPS.md §9` «Métodos de pago locales asíncronos» — OXXO/SPEI/CoDi: ciclo de
  vida y reconciliación. **Ojo: hay dos secciones numeradas §9**; la de migraciones
  es la otra.
- `docs/OPS.md §11` — Stripe Connect Express: los 6 pasos y las reglas de seguridad.
- `docs/AUDITORIA-ESTATUS.md §7` — backlog de remediación y filas que dependían de un tercero.
- `.env.local.example` — todas las variables con su uso documentado.
- `src/lib/integration-status.ts` — qué integración está encendida hoy.
- `src/lib/credenciales.contract.test.ts` — **el contrato que vigila este
  documento**: que toda integración esté documentada, que no haya variables
  fantasma, que los enlaces sean `https` y coincidan con el registro de POS, y que
  los punteros apunten a archivos que existen. Si editas este documento y el
  contrato se pone rojo, el contrato tiene razón.
