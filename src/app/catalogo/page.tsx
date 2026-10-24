import { redirect } from "next/navigation"

/**
 * `/catalogo` → el catálogo de la ciudad.
 *
 * POR QUÉ EXISTE ESTA REDIRECCIÓN
 * -------------------------------
 * El catálogo vive en `/{ciudad}` y las categorías en `/{ciudad}/categoria/{slug}`,
 * pero **ocho enlaces internos** (las respuestas de `/preguntas`) apuntaban a
 * `/catalogo`, y ese path no existía: daba **404**. Un enlace "Ver catálogo" que
 * lleva a una página no encontrada es peor que no ofrecer el enlace.
 *
 * Se redirige a `/` en vez de fijar una ciudad a mano: `/` ya resuelve la ciudad
 * (cookie o geolocalización por IP) en el proxy, así que el visitante aterriza en
 * la suya en vez de en Chihuahua por defecto.
 *
 * `permanent: false` (307): la ciudad de destino puede cambiar por visitante, así
 * que un 308 permanente quedaría cacheado por el navegador apuntando a la ciudad
 * equivocada.
 */
export default function CatalogoIndex() {
  redirect("/")
}
