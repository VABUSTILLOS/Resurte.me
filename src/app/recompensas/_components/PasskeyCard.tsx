"use client";

import { useCallback, useEffect, useState } from "react";
import { Fingerprint, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  PASSKEY_NAME_MAX_LENGTH,
  formatPasskeyDate,
  isPasskeyCancelled,
  isPasskeySupported,
  passkeyErrorMessage,
  passkeyLabel,
  sortPasskeys,
  validatePasskeyName,
  type PasskeyLike,
} from "@/lib/passkeys";

/**
 * Llaves de acceso / passkeys (U13).
 *
 * Una llave de acceso sustituye a la contraseña: el dispositivo guarda una
 * credencial WebAuthn y la libera con huella, rostro, PIN o llave física. No
 * hay secreto compartido que robar en un volcado de base de datos.
 *
 * La tarjeta se oculta entera —sin dejar hueco— cuando:
 *  - el navegador no soporta WebAuthn (o no estamos en https/localhost), o
 *  - el proyecto de Supabase todavía no tiene las passkeys habilitadas (la
 *    llamada a `list()` falla). Es el mismo criterio que `PushOptInCard`: antes
 *    que un control que no puede funcionar, nada.
 */

type Status = "loading" | "hidden" | "ready";

export function PasskeyCard() {
  const [status, setStatus] = useState<Status>("loading");
  const [passkeys, setPasskeys] = useState<PasskeyLike[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [supabase] = useState(() =>
    typeof window === "undefined" ? null : createClient()
  );

  const load = useCallback(async (): Promise<PasskeyLike[] | null> => {
    if (!supabase) return null;
    const { data, error: listError } = await supabase.auth.passkey.list();
    if (listError) return null;
    return sortPasskeys((data ?? []) as PasskeyLike[]);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isPasskeySupported() || !supabase) {
        if (!cancelled) setStatus("hidden");
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        if (!cancelled) setStatus("hidden");
        return;
      }
      const list = await load();
      if (cancelled) return;
      // `list()` fallando aquí significa, casi siempre, que el proyecto de
      // Supabase no tiene las passkeys activadas.
      if (list === null) setStatus("hidden");
      else {
        setPasskeys(list);
        setStatus("ready");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, load]);

  const refresh = useCallback(async () => {
    const list = await load();
    if (list) setPasskeys(list);
  }, [load]);

  const register = useCallback(async () => {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { error: registerError } = await supabase.auth.registerPasskey();
      if (registerError) throw registerError;
      await refresh();
      setNotice("Llave creada. Ya puedes entrar sin contraseña desde este dispositivo.");
    } catch (err) {
      if (!isPasskeyCancelled(err)) setError(passkeyErrorMessage(err, "register"));
    } finally {
      setBusy(false);
    }
  }, [supabase, refresh]);

  const saveName = useCallback(
    async (passkeyId: string) => {
      if (!supabase) return;
      const result = validatePasskeyName(draftName);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const { error: updateError } = await supabase.auth.passkey.update({
          passkeyId,
          friendlyName: result.value,
        });
        if (updateError) throw updateError;
        await refresh();
        setEditingId(null);
      } catch (err) {
        setError(passkeyErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [supabase, draftName, refresh]
  );

  const remove = useCallback(
    async (passkey: PasskeyLike) => {
      if (!supabase) return;
      // Confirmación explícita: borrar la llave es irreversible y puede dejar
      // al usuario sin su única forma de entrar.
      if (!window.confirm(`¿Borrar "${passkeyLabel(passkey)}"? No se puede deshacer.`)) {
        return;
      }
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const { error: deleteError } = await supabase.auth.passkey.delete({
          passkeyId: passkey.id,
        });
        if (deleteError) throw deleteError;
        await refresh();
        setNotice("Llave borrada.");
      } catch (err) {
        setError(passkeyErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [supabase, refresh]
  );

  if (status !== "ready") return null;

  return (
    <div className="rounded-2xl bg-white border border-cream-300 p-4">
      <div className="flex items-center gap-2">
        <Fingerprint className="h-5 w-5 text-emerald-600" aria-hidden="true" />
        <p className="text-warm-700 text-sm font-semibold">Llaves de acceso</p>
      </div>
      <p className="text-[#5c6069] text-xs mt-1">
        Entra con tu huella, rostro o PIN, sin escribir contraseña. Cada
        dispositivo guarda su propia llave.
      </p>

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">
          {notice}
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {passkeys.map((passkey) => (
          <li
            key={passkey.id}
            className="flex items-center justify-between gap-3 rounded-xl bg-cream-100 border border-cream-300 p-3"
          >
            {editingId === passkey.id ? (
              <form
                className="flex-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveName(passkey.id);
                }}
              >
                <label className="sr-only" htmlFor={`passkey-name-${passkey.id}`}>
                  Nombre de la llave
                </label>
                <input
                  id={`passkey-name-${passkey.id}`}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  maxLength={PASSKEY_NAME_MAX_LENGTH}
                  autoFocus
                  className="w-full rounded-lg border border-cream-300 bg-white px-3 py-2 text-sm text-warm-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setError(null);
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#5c6069]"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="min-w-0">
                  <p className="text-warm-700 text-sm font-medium truncate">
                    {passkeyLabel(passkey)}
                  </p>
                  {formatPasskeyDate(passkey.created_at) && (
                    <p className="text-[#5c6069] text-xs">
                      Creada el {formatPasskeyDate(passkey.created_at)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Renombrar ${passkeyLabel(passkey)}`}
                    disabled={busy}
                    onClick={() => {
                      setEditingId(passkey.id);
                      setDraftName(passkey.friendly_name ?? "");
                      setError(null);
                      setNotice(null);
                    }}
                    className="rounded-lg p-2 text-[#5c6069] hover:bg-cream-300 disabled:opacity-50 touch-target"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Borrar ${passkeyLabel(passkey)}`}
                    disabled={busy}
                    onClick={() => remove(passkey)}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-50 touch-target"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {passkeys.length === 0 && (
        <p className="mt-3 text-[#5c6069] text-xs">
          Todavía no tienes ninguna llave de acceso.
        </p>
      )}

      <button
        type="button"
        onClick={register}
        disabled={busy}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-2.5 text-sm font-bold text-white active:scale-[0.98] transition-transform touch-target disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Plus className="h-4 w-4" aria-hidden="true" />
        )}
        Crear llave en este dispositivo
      </button>
    </div>
  );
}
