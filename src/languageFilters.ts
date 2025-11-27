import type { Uri } from "vscode";
import type {
  PrettierBuiltInParserName,
  PrettierSupportLanguage,
} from "./types.js";

export function getParserFromLanguageId(
  languages: readonly PrettierSupportLanguage[],
  uri: Uri,
  languageID: string,
): PrettierBuiltInParserName | undefined {
  // This is a workaround for when the vscodeLanguageId is duplicated in multiple prettier
  // languages. In these cases the first match is not the preferred match so we override with the
  // parser that exactly matches the languageId. Specific undesired cases here are: `html` matching
  // to `angular` `json` matching to `json-stringify`
  const languageParsers = ["html", "json"];
  if (uri.scheme !== "file" && languageParsers.includes(languageID)) {
    return languageID;
  }

  const language = languages.find(
    (lang) =>
      lang.extensions !== undefined
      && Array.isArray(lang.vscodeLanguageIds)
      && lang.vscodeLanguageIds.includes(languageID),
  );

  if (language) {
    return language.parsers[0];
  }

  return undefined;
}
