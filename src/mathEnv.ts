import { App, Editor, FuzzySuggestModal, Notice } from "obsidian";
import { t } from "./l10n/locale";
import { planMathEnvironmentWrap } from "./mathEnvPlan";
import { offsetToTextPosition, replaceTextRange } from "./textPosition";
import type { MathEnvironment } from "./types";

export function wrapMathWithEnvironment(editor: Editor, environment: MathEnvironment): void {
  const document = editor.getValue();
  const anchor = editor.posToOffset(editor.getCursor("anchor"));
  const head = editor.posToOffset(editor.getCursor("head"));
  const plan = planMathEnvironmentWrap(document, anchor, head, environment);

  if (plan.type === "blocked") {
    new Notice(
      t(
        plan.reason === "inline-math"
          ? "noticeMoveOutOfInlineMath"
          : "noticeCouldNotCreateDisplayMath",
      ),
    );
    return;
  }

  const nextDocument = replaceTextRange(document, plan.from, plan.to, plan.text);
  editor.transaction({
    changes: [
      {
        from: editor.offsetToPos(plan.from),
        to: editor.offsetToPos(plan.to),
        text: plan.text,
      },
    ],
    selection: { from: offsetToTextPosition(nextDocument, plan.caret) },
  });
}

export function openEnvironmentPicker(
  app: App,
  editor: Editor,
  environments: MathEnvironment[],
): void {
  if (environments.length === 0) {
    new Notice(t("noticeAddMathEnvFirst"));
    return;
  }

  new EnvironmentPickerModal(app, environments, (environment) => {
    wrapMathWithEnvironment(editor, environment);
  }).open();
}

class EnvironmentPickerModal extends FuzzySuggestModal<MathEnvironment> {
  constructor(
    app: App,
    private readonly environments: MathEnvironment[],
    private readonly onChoose: (environment: MathEnvironment) => void,
  ) {
    super(app);
    this.setPlaceholder(t("envPickerPlaceholder"));
  }

  getItems(): MathEnvironment[] {
    return this.environments;
  }

  getItemText(item: MathEnvironment): string {
    return item.name;
  }

  onChooseItem(item: MathEnvironment): void {
    this.onChoose(item);
  }
}
