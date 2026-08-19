import { useMemo } from "react";
import { useI18n } from "../i18n/I18nProvider";
import { isNamedIanaTimeZone } from "../schedule/timezone";

const priorityZones = [
  "Asia/Shanghai",
  "Asia/Dubai",
  "Europe/London",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "UTC",
];

function zones(current: string): string[] {
  try {
    const all = Intl.supportedValuesOf("timeZone");
    const result = [
      ...priorityZones,
      ...all.filter((zone) => !priorityZones.includes(zone)),
    ];
    return isNamedIanaTimeZone(current) && !result.includes(current)
      ? [current, ...result]
      : result;
  } catch {
    return isNamedIanaTimeZone(current) && !priorityZones.includes(current)
      ? [current, ...priorityZones]
      : priorityZones;
  }
}

export function TimezoneSelect({
  value,
  onChange,
  label,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const options = useMemo(() => zones(value), [value]);
  return (
    <label className={compact ? "compact-control" : "field"}>
      <span className={compact ? "visually-hidden" : undefined}>
        {label ?? t("timezone")}
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((zone) => (
          <option value={zone} key={zone}>
            {zone}
          </option>
        ))}
      </select>
    </label>
  );
}
