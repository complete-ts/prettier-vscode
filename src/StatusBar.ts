import type {
  Disposable,
  DocumentSelector,
  LanguageStatusItem,
  StatusBarItem,
} from "vscode";
import {
  languages,
  LanguageStatusSeverity,
  StatusBarAlignment,
  ThemeColor,
  window,
} from "vscode";
import { FormatterStatus } from "./FormatterStatus.js";

export class StatusBar implements Disposable {
  private readonly statusBarItem: StatusBarItem;
  private readonly languageStatusItem: LanguageStatusItem;
  constructor() {
    this.statusBarItem = window.createStatusBarItem(
      "prettier.status",
      StatusBarAlignment.Right,
      -1,
    );
    this.languageStatusItem = languages.createLanguageStatusItem(
      "prettier.status",
      [],
    );

    this.statusBarItem.name = "Prettier";
    this.statusBarItem.text = "Prettier";
    this.statusBarItem.command = "prettier.openOutput";
    this.update(FormatterStatus.Ready);
    this.statusBarItem.show();

    this.languageStatusItem.name = "Prettier";
    this.languageStatusItem.text = "Prettier";
    this.languageStatusItem.command = {
      title: "View Logs",
      command: "prettier.openOutput",
    };
  }

  public updateConfig({ selector }: { selector: DocumentSelector }): void {
    this.languageStatusItem.selector = selector;
  }

  /** Update the statusBarItem message and show the statusBarItem. */
  public update(result: FormatterStatus): void {
    this.statusBarItem.text = `$(${result.toString()}) Prettier`;
    switch (result) {
      case FormatterStatus.Ignore:
      case FormatterStatus.Warn: {
        this.statusBarItem.backgroundColor = new ThemeColor(
          "statusBarItem.warningBackground",
        );
        this.languageStatusItem.severity = LanguageStatusSeverity.Warning;
        break;
      }

      case FormatterStatus.Error: {
        this.statusBarItem.backgroundColor = new ThemeColor(
          "statusBarItem.errorBackground",
        );
        this.languageStatusItem.severity = LanguageStatusSeverity.Error;
        break;
      }

      default: {
        this.statusBarItem.backgroundColor = new ThemeColor(
          "statusBarItem.foregroundBackground",
        );
        this.languageStatusItem.severity = LanguageStatusSeverity.Information;
        break;
      }
    }
    this.statusBarItem.show();
  }

  public hide(): void {
    this.statusBarItem.hide();
  }

  public dispose(): void {
    this.languageStatusItem.dispose();
    this.statusBarItem.dispose();
  }
}
