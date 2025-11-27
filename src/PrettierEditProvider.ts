import type {
  CancellationToken,
  DocumentFormattingEditProvider,
  DocumentRangeFormattingEditProvider,
  FormattingOptions,
  Range,
  TextDocument,
  TextEdit,
} from "vscode";
import type { ExtensionFormattingOptions } from "./types.js";

export class PrettierEditProvider
  implements DocumentRangeFormattingEditProvider, DocumentFormattingEditProvider
{
  private readonly provideEdits: (
    document: TextDocument,
    options: ExtensionFormattingOptions,
  ) => Promise<TextEdit[]>;

  constructor(provideEdits: typeof this.provideEdits) {
    this.provideEdits = provideEdits;
  }

  public async provideDocumentRangeFormattingEdits(
    document: TextDocument,
    range: Range,
    _options: FormattingOptions,
    _token: CancellationToken,
    // eslint-disable-next-line complete/no-mutable-return
  ): Promise<TextEdit[]> {
    return await this.provideEdits(document, {
      rangeEnd: document.offsetAt(range.end),
      rangeStart: document.offsetAt(range.start),
      force: false,
    });
  }

  public async provideDocumentFormattingEdits(
    document: TextDocument,
    _options: FormattingOptions,
    _token: CancellationToken,
    // eslint-disable-next-line complete/no-mutable-return
  ): Promise<TextEdit[]> {
    return await this.provideEdits(document, {
      force: false,
    });
  }
}
