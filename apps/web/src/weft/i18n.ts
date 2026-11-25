import { useSyncExternalStore } from "react";
import { getI18nSnapshot, subscribeI18n } from "../i18n/runtime";

export interface WeftMessages {
  readonly current: string;
  readonly resetsIn: (duration: string) => string;
}

const CATALOG: Readonly<Record<string, WeftMessages>> = {
  en: {
    current: "Current",
    resetsIn: (duration) => `Resets in ${duration}`,
  },
  zh: {
    current: "当前",
    resetsIn: (duration) => `${duration} 后重置`,
  },
  de: {
    current: "Aktuell",
    resetsIn: (duration) => `Wird in ${duration} zurückgesetzt`,
  },
  es: {
    current: "Actual",
    resetsIn: (duration) => `Se restablece en ${duration}`,
  },
  fr: {
    current: "Actuel",
    resetsIn: (duration) => `Réinitialisation dans ${duration}`,
  },
  ja: {
    current: "現在",
    resetsIn: (duration) => `${duration}後にリセット`,
  },
  ko: {
    current: "현재",
    resetsIn: (duration) => `${duration} 후 재설정`,
  },
  "pt-BR": {
    current: "Atual",
    resetsIn: (duration) => `Redefine em ${duration}`,
  },
  ru: {
    current: "Текущий",
    resetsIn: (duration) => `Сброс через ${duration}`,
  },
  sv: {
    current: "Aktuell",
    resetsIn: (duration) => `Återställs om ${duration}`,
  },
};

export function resolveWeftMessages(locale: string): WeftMessages {
  const exact = CATALOG[locale];
  if (exact) return exact;
  const base = locale.split("-")[0];
  if (base) {
    const match = CATALOG[base];
    if (match) return match;
  }
  return CATALOG.en!;
}

export function useWeftMessages(): WeftMessages {
  const { locale } = useSyncExternalStore(subscribeI18n, getI18nSnapshot);
  return resolveWeftMessages(locale);
}
