import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n/I18nProvider";

const focusableSelector = [
  "[data-dialog-initial-focus]",
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function ModalSheet({
  title,
  children,
  footer,
  onClose,
  size = "full",
  returnFocusRef,
  fallbackFocusSelector,
  focusKey,
}: {
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: "full" | "compact";
  returnFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusSelector?: string;
  focusKey?: string;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const initialTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    const appRoot = document.getElementById("root");
    if (!dialog || !appRoot) return;

    initialTriggerRef.current =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    const returnFocusTarget = returnFocusRef?.current;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    appRoot.inert = true;
    appRoot.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0)
      document.body.style.paddingRight = `${scrollbarWidth}px`;

    const focusable = () =>
      [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(
        (element) =>
          !element.hasAttribute("disabled") &&
          element.getAttribute("aria-hidden") !== "true",
      );
    const initial =
      dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]") ??
      focusable()[0] ??
      dialog;
    queueMicrotask(() => initial.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      appRoot.inert = false;
      appRoot.removeAttribute("aria-hidden");
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      const target = returnFocusTarget ?? initialTriggerRef.current;
      const fallback = fallbackFocusSelector
        ? document.querySelector<HTMLElement>(fallbackFocusSelector)
        : null;
      const focusTarget =
        target?.isConnected &&
        target !== document.body &&
        target !== document.documentElement
          ? target
          : fallback;
      if (focusTarget?.isConnected) queueMicrotask(() => focusTarget.focus());
    };
  }, [fallbackFocusSelector, returnFocusRef]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || focusKey === undefined) return;
    queueMicrotask(() => {
      const target =
        dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]") ??
        dialog.querySelector<HTMLElement>(focusableSelector) ??
        dialog;
      target.focus();
    });
  }, [focusKey]);

  const modalRoot = document.getElementById("modal-root");
  if (!modalRoot)
    throw new Error("ModalSheet requires the static #modal-root element");

  return createPortal(
    <div
      className="modal-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={`modal-sheet modal-sheet-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-sheet-header">
          <h2
            id={titleId}
            title={typeof title === "string" ? title : undefined}
          >
            {title}
          </h2>
          <button
            className="icon-button"
            type="button"
            aria-label={t("close")}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="modal-sheet-content">{children}</div>
        {footer && <div className="modal-sheet-footer">{footer}</div>}
      </section>
    </div>,
    modalRoot,
  );
}
