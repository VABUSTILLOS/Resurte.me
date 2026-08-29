# Guía de captura en campo — Agente de Ventas IA (Chihuahua)

> Para el vendedor de Resurte.me. Cómo completar las fichas del CRM
> durante las visitas para que el Agente IA trabaje con datos reales.
> Complemento de `docs/agente-ia.md`.

## Qué capturar en cada visita (5 minutos por restaurante)

| # | Dato | Dónde va en el CRM | Por qué importa |
|---|------|--------------------|-----------------|
| 1 | Nombre de **quien decide las compras** (dueño, chef o gerente de compras) | Campo **Nombre de contacto** | El agente personaliza los mensajes con ese nombre |
| 2 | **Celular / WhatsApp** de esa persona | Campo **WhatsApp** (10 dígitos, sin espacios) | Sin él no hay seguimiento por wa.me; el teléfono fijo del restaurante va en **Teléfono** |
| 3 | **Quién recibe proveedores** y en qué horario | **Notas** | Las visitas de seguimiento se agendan en ese horario |
| 4 | **Días y monto de pedido semanal real** | Campos **Volumen semanal min/max** | Recalibra el tier (1/2/3) con datos reales, no estimados |
| 5 | **Categorías que compra** y su proveedor actual | **Notas** | El pitch se enfoca en lo que el proveedor actual no le resuelve |
| 6 | Correo para facturación / cotizaciones | Campo **Email** | Envío de catálogo y estado de cuenta |
| 7 | Instagram del restaurante | Campo **Instagram** | Canal alterno de contacto y señal de actividad |

## Cómo registrarlo (móvil, desde el sitio)

1. Al terminar la visita, abre **Comercialización → Agente IA → Cola del día**
   y toca **Visita** en la tarjeta del restaurante: el agente registra la
   actividad y programa el siguiente contacto (WhatsApp al día siguiente).
2. En **Comercialización → Prospectos**, edita la ficha y captura los 7
   datos de la tabla. El formulario ya incluye **Tier** y **Zona**.
3. Si el restaurante no estaba en la lista, créalo como prospecto nuevo
   con `source = visita_campo` y la zona de la ruta del día.

## Reglas de oro

- **El fijo no es WhatsApp.** Los números 614/656 de las fichas son de
  recepción; sirven para ubicar a la persona, no para el link wa.me.
  Captura siempre el celular de quien decide.
- **No visites en horario de servicio** (12:00–14:30 y 19:00–21:30).
  Mejor ventana: 15:00–17:00; para desayunadores, 10:00–11:30.
- **Pregunta directo:** "¿Quién hace los pedidos de insumos aquí?" — en
  restaurantes independientes decide el chef/dueño; en grupos (Mochomos,
  Palominos, Kampai, Los Arcos) confirma si compra el gerente local o el
  corporativo.
- **Ojo con Los Arcos:** su grupo tiene distribuidora propia de mariscos
  (MCA). No vendas pescados y mariscos ahí; entra por verdura, lácteos,
  quesos, abarrotes y desechables.
- **Ojo con Palominos:** su carne insignia es de Rancho El 17. Entra por
  categorías complementarias, no por cortes.
- **ARDEO y Yoko están en Cd. Juárez.** No agendes visita en Chihuahua
  hasta confirmar si tienen sucursal local.

## Meta de captura

El plan pide llegar a ~200 prospectos. Las fichas semilla cubren 29
(10 Tier 1, 9 Tier 2, 10 Tier 3). Cada día de ruta, el vendedor debe
levantar **3–5 fichas nuevas** de restaurantes que vea en la zona
(tier 3 casi siempre): con 4 días de ruta por semana se suman
12–20 semanales y se cubre la meta en 3 meses, ya clasificados por
zona desde su captura.

## Cómo usa el agente lo que capturas

- **Contacto + WhatsApp** → mensajes de seguimiento personalizados con
  wa.me listos para aprobar.
- **Volumen real** → recalcula prioridad en la cola del día.
- **Categorías y proveedor actual** → el LLM adapta el pitch (o la
  plantilla de respaldo) a lo que el prospecto sí necesita.
- **Zona** → la cola del día se ordena por la ruta de la semana
  (lun=Centro, mar=Distrito Uno, mié=Paseo Central, jue=Periférico).
