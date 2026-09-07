#!/usr/bin/env bash
# Pruebas de humo de las rutas admin de Kie.ai.
#
# Requiere una cookie de sesión ADMIN del sitio. Para obtenerla:
#   1. Abre el sitio en el navegador y entra con tu cuenta de administrador.
#   2. DevTools → Application → Cookies → busca la cookie
#      "sb-<ref>-auth-token" (el nombre exacto depende de tu proyecto Supabase).
#   3. Copia su contenido y guárdalo como "nombre=valor" en un archivo
#      (por defecto /tmp/kie-cookie.txt):
#        echo 'sb-xxxx-auth-token=<valor>' > /tmp/kie-cookie.txt
#   4. Ajusta COOKIE_FILE si lo guardaste en otra ruta.
#
# Uso:
#   COOKIE_FILE=/tmp/kie-cookie.txt ./scripts/test-kie-ai.sh
#   BASE=https://tu-dominio.com COOKIE_FILE=/tmp/kie-cookie.txt ./scripts/test-kie-ai.sh
#
# Pasos:
#   1) Chat síncrono con un mensaje simple → imprime { content }.
#   2) Imagen asíncrona → imprime el taskId.
#   3) Polling de estado hasta success (máx ~15 intentos cada 2 s) → imprime el record.
#
# Requiere: curl, y opcionalmente python3 (para formatear el JSON del record).

set -euo pipefail

BASE="${BASE:-http://localhost:3000}"
COOKIE_FILE="${COOKIE_FILE:-/tmp/kie-cookie.txt}"

if [[ ! -f "$COOKIE_FILE" ]]; then
  echo "No se encuentra la cookie en $COOKIE_FILE"
  echo "Guárdala como nombre=valor (ver comentarios al inicio del script)."
  exit 1
fi

COOKIE="$(cat "$COOKIE_FILE")"
if [[ -z "$COOKIE" ]]; then
  echo "El archivo de cookie $COOKIE_FILE está vacío."
  exit 1
fi

# post <path> <json> — POST con Content-Type JSON + cookie de sesión.
post() {
  local path="$1"
  local json="$2"
  curl -sS -X POST "$BASE$path" \
    -H "Content-Type: application/json" \
    -H "Cookie: $COOKIE" \
    -d "$json"
}

# get <path> — GET con cookie de sesión.
get() {
  local path="$1"
  curl -sS "$BASE$path" \
    -H "Cookie: $COOKIE"
}

echo "==> 1) CHAT síncrono"
CHAT_RESPONSE="$(post /api/admin/kie-ai/chat '{
  "messages": [
    { "role": "user", "content": "Dime quién eres en una frase." }
  ],
  "model": "gpt-4o-mini"
}')"
echo "$CHAT_RESPONSE"
echo

echo "==> 2) IMAGEN asíncrona (crea la tarea)"
IMAGE_RESPONSE="$(post /api/admin/kie-ai/image '{
  "prompt": "Un atardecer minimalista en la playa, estilo flat design",
  "size": "1:1"
}')"
echo "$IMAGE_RESPONSE"
echo

# Extrae el taskId con python3 si está disponible; si no, con sed.
if command -v python3 >/dev/null 2>&1; then
  TASK_ID="$(printf '%s' "$IMAGE_RESPONSE" | python3 -c 'import sys, json; print(json.load(sys.stdin)["taskId"])')"
else
  TASK_ID="$(printf '%s' "$IMAGE_RESPONSE" | sed -n 's/.*"taskId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
fi

if [[ -z "$TASK_ID" ]]; then
  echo "No se pudo obtener un taskId de la respuesta de imagen."
  exit 1
fi
echo "taskId: $TASK_ID"
echo

echo "==> 3) Polling de estado (máx 15 intentos, cada 2 s)"
MAX_ATTEMPTS=15
for ((i = 1; i <= MAX_ATTEMPTS; i++)); do
  STATUS_RESPONSE="$(get "/api/admin/kie-ai/status?taskId=$TASK_ID")"

  # Normaliza el estado para la comparación (la API reporta success/fail).
  STATE="$(printf '%s' "$STATUS_RESPONSE" \
    | python3 -c 'import sys, json; print(json.load(sys.stdin)["record"]["state"].lower())' 2>/dev/null \
    || printf '%s' "$STATUS_RESPONSE" | sed -n 's/.*"state"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | tr '[:upper:]' '[:lower:]')"

  echo "Intento $i/$MAX_ATTEMPTS — estado: ${STATE:-desconocido}"
  if [[ "$STATE" == "success" || "$STATE" == "fail" || "$STATE" == "failed" || "$STATE" == "error" ]]; then
    break
  fi
  if ((i == MAX_ATTEMPTS)); then
    echo "Se agotaron los intentos esperando la tarea $TASK_ID."
    exit 1
  fi
  sleep 2
done

echo "Record final:"
if command -v python3 >/dev/null 2>&1; then
  printf '%s' "$STATUS_RESPONSE" | python3 -m json.tool
else
  echo "$STATUS_RESPONSE"
fi
