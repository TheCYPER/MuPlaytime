import { Temporal } from "@js-temporal/polyfill";
import type { LocalInstantChoice } from "../schedule/timezone";
import { useI18n } from "../i18n/I18nProvider";

export interface BoardTimeChoiceContext {
  issue: "ambiguous" | "nonexistent";
  viewerTimeZone: string;
  choices: LocalInstantChoice[];
  onChoose: (choice: LocalInstantChoice) => void;
}

export function BoardTimeChoiceSheet({
  context,
  onClose,
}: {
  context: BoardTimeChoiceContext;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="board-time-choice">
      <p data-dialog-initial-focus tabIndex={-1}>
        {t(context.issue === "ambiguous" ? "ambiguousTime" : "nonexistentTime")}
      </p>
      <div className="sheet-action-stack">
        {context.choices.map((choice) => {
          const zoned = Temporal.Instant.from(
            choice.instant,
          ).toZonedDateTimeISO(context.viewerTimeZone);
          return (
            <button
              className="button button-secondary"
              type="button"
              key={choice.instant}
              onClick={() => {
                context.onChoose(choice);
                onClose();
              }}
            >
              {zoned
                .toPlainDateTime()
                .toString({ smallestUnit: "minute" })
                .replace("T", " ")}{" "}
              {" · "}
              {choice.offset}
            </button>
          );
        })}
      </div>
    </div>
  );
}
