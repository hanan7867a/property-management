import { en } from "@/lib/i18n/en";
import { ur } from "@/lib/i18n/ur";

export type SupportedLanguage = "en" | "ur";
export type Dictionary = { [Key in keyof typeof en]: string };

export const dictionaries: Record<SupportedLanguage, Dictionary> = { en, ur };
