import { defineRouting } from "next-intl/routing";

/**
 * The languages the practice actually works in. vitareba.com offers EN · DE · FR,
 * and the FAQ commits to consultations "in English, German and French".
 *
 * Italian was removed deliberately: a localised site is a promise of care in
 * that language, and offering one the clinic cannot staff sets a patient up to
 * arrive and not be understood. Add a locale when the practice can serve it,
 * not when the strings exist.
 */
export const routing = defineRouting({
  locales: ["de", "en", "fr"],
  defaultLocale: "de",
});
