import { FavoritosClient } from "./favoritos-client"

/**
 * /[ciudad]/favoritos — "Mi lista de resurtido".
 * Los ids viven en localStorage (invitados) + user_carts-style sync
 * (user_favorites, migración 00069) para usuarios con sesión; los productos
 * se resuelven contra el catálogo público vía /api/favorites/resolve.
 */
export default function FavoritosPage() {
  return <FavoritosClient />
}
