#!/usr/bin/env bash
# Compara imágenes huérfanas candidatas vs imágenes reales en products
# Uso: ./scripts/compare-orphan-images.sh productos_imgs.txt
# Output: scripts/orphan-images-to-delete.txt

set -euo pipefail

CANDIDATES="/Users/mac/.copilot/session-state/1b92be98-5d74-4785-ac32-149e0d6c6e9c/files/imagenes_huerfanas_candidatas.txt"
PRODUCTOS="${1:-productos_imgs.txt}"
OUTPUT="scripts/orphan-images-to-delete.txt"
BACKUP_DIR="public/.trash"

if [[ ! -f "$CANDIDATES" ]]; then
  echo "No se encuentra $CANDIDATES"
  exit 1
fi
if [[ ! -f "$PRODUCTOS" ]]; then
  echo "No se encuentra $PRODUCTOS"
  exit 1
fi

# Normalizar: solo basename, lowercase
normalize() {
  basename "$1" | tr '[:upper:]' '[:lower:]'
}

# Leer products a array asociativo
declare -A product_set
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  product_set["$(normalize "$line")"]=1
done < "$PRODUCTOS"

# Filtrar candidatas
> "$OUTPUT"
orphan_count=0
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  norm=$(normalize "$line")
  if [[ -z "${product_set[$norm]:-}" ]]; then
    echo "$line" >> "$OUTPUT"
    ((orphan_count++))
  fi
done < "$CANDIDATES"

total_candidates=$(wc -l < "$CANDIDATES")
total_products=$(wc -l < "$PRODUCTOS")

echo "Candidatas totales: $total_candidates"
echo "Imágenes en products: $total_products"
echo "Únicas en products: ${#product_set[@]}"
echo "Verdaderamente huérfanas: $orphan_count"
echo ""
echo "Lista guardada en: $OUTPUT"
echo ""
echo "Para borrado seguro con backup:"
echo "  mkdir -p $BACKUP_DIR"
echo "  while read f; do mv \"public/\$f\" \"$BACKUP_DIR/\"; done < $OUTPUT"