/**
 * Texts of the startup recovery screen (`src/pwa/bootRecovery.ts`).
 *
 * That screen shows when the app's program files fail to load, before Vue or Haven are
 * available, so this module imports nothing but the locale list. Haven's locale is not
 * known yet at that point; the browser language picks the text.
 */
import { resolveLocale, type Locale } from "@/lib/locales";

const en = {
  bootTitle: "Recovering startup",
  bootChecking: "Checking for an updated offline shell so To Do Manager can reload cleanly.",
  bootFailed:
    "To Do Manager hit a startup error. Clear the offline cache for this app and reload to fetch a fresh copy.",
  bootRetry: "Clear cache & reload",
  bootDismiss: "Dismiss",
};

export type BootMessages = { [K in keyof typeof en]: string };

export const bootMessages = {
  en,
  de: {
    bootTitle: "Start wird repariert",
    bootChecking:
      "Suche nach einer aktualisierten Offline-Version, damit To Do Manager sauber neu laden kann.",
    bootFailed:
      "To Do Manager ist beim Start auf einen Fehler gestoßen. Leere den Offline-Cache dieser App und lade neu, um eine frische Kopie zu holen.",
    bootRetry: "Cache leeren und neu laden",
    bootDismiss: "Schließen",
  },
  es: {
    bootTitle: "Recuperando el inicio",
    bootChecking:
      "Buscando una versión sin conexión actualizada para que To Do Manager pueda recargarse limpiamente.",
    bootFailed:
      "To Do Manager ha tenido un error al iniciarse. Vacía la caché sin conexión de esta app y recarga para obtener una copia nueva.",
    bootRetry: "Vaciar caché y recargar",
    bootDismiss: "Cerrar",
  },
  fr: {
    bootTitle: "Récupération du démarrage",
    bootChecking:
      "Recherche d'une version hors ligne à jour pour que To Do Manager se recharge proprement.",
    bootFailed:
      "To Do Manager a rencontré une erreur au démarrage. Videz le cache hors ligne de cette app et rechargez pour obtenir une copie neuve.",
    bootRetry: "Vider le cache et recharger",
    bootDismiss: "Fermer",
  },
  it: {
    bootTitle: "Ripristino dell'avvio",
    bootChecking:
      "Ricerca di una versione offline aggiornata per ricaricare To Do Manager in modo pulito.",
    bootFailed:
      "To Do Manager ha riscontrato un errore all'avvio. Svuota la cache offline di questa app e ricarica per ottenere una copia nuova.",
    bootRetry: "Svuota cache e ricarica",
    bootDismiss: "Chiudi",
  },
  nb: {
    bootTitle: "Gjenoppretter oppstarten",
    bootChecking:
      "Ser etter en oppdatert frakoblet versjon slik at To Do Manager kan lastes inn på nytt uten feil.",
    bootFailed:
      "To Do Manager fikk en feil ved oppstart. Tøm den frakoblede hurtigbufferen for denne appen og last inn på nytt for å hente en fersk kopi.",
    bootRetry: "Tøm hurtigbuffer og last inn på nytt",
    bootDismiss: "Lukk",
  },
  nl: {
    bootTitle: "Opstarten herstellen",
    bootChecking:
      "Zoeken naar een bijgewerkte offlineversie zodat To Do Manager netjes opnieuw kan laden.",
    bootFailed:
      "To Do Manager liep bij het opstarten tegen een fout aan. Leeg de offlinecache van deze app en laad opnieuw om een verse kopie op te halen.",
    bootRetry: "Cache legen en opnieuw laden",
    bootDismiss: "Sluiten",
  },
  pl: {
    bootTitle: "Odzyskiwanie uruchamiania",
    bootChecking:
      "Sprawdzanie zaktualizowanej wersji offline, aby To Do Manager mógł się poprawnie przeładować.",
    bootFailed:
      "Podczas uruchamiania To Do Manager wystąpił błąd. Wyczyść pamięć podręczną offline tej aplikacji i załaduj ponownie, aby pobrać świeżą kopię.",
    bootRetry: "Wyczyść pamięć podręczną i załaduj ponownie",
    bootDismiss: "Zamknij",
  },
} satisfies Record<Locale, BootMessages>;

/** The recovery texts in the browser's language (English when Haven does not offer it). */
export function bootTexts(tag = typeof navigator === "undefined" ? undefined : navigator.language): BootMessages {
  return bootMessages[resolveLocale(tag)];
}
