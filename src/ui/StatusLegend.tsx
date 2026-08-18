import { useI18n } from "../i18n/I18nProvider";

export function StatusLegend() {
  const { t } = useI18n();
  return (
    <div
      className="legend"
      aria-label={`${t("free")}, ${t("busy")}, ${t("unknown")}`}
    >
      <span>
        <i className="swatch status-free" />
        {t("free")}
      </span>
      <span>
        <i className="swatch status-busy" />
        {t("busy")}
      </span>
      <span>
        <i className="swatch status-unknown" />
        {t("unknown")}
      </span>
    </div>
  );
}
