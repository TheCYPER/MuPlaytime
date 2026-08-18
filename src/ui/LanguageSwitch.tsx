import { useI18n } from "../i18n/I18nProvider";

export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="compact-control">
      <span className="visually-hidden">{t("language")}</span>
      <select
        aria-label={t("language")}
        value={locale}
        onChange={(event) =>
          setLocale(event.target.value === "zh-CN" ? "zh-CN" : "en")
        }
      >
        <option value="en">English</option>
        <option value="zh-CN">简体中文</option>
      </select>
    </label>
  );
}
