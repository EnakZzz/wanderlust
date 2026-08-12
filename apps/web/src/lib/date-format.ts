type DateParts = {
  year: number;
  month: number;
  day: number;
};

function parseIsoDate(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function formatDateParts(parts: DateParts, includeYear: boolean): string {
  return includeYear ? `${parts.year}年${parts.month}月${parts.day}日` : `${parts.month}月${parts.day}日`;
}

export function formatTripDateRange(startDate?: string, endDate?: string): string {
  if (!startDate || !endDate) return "日期未设置";
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end) return startDate === endDate ? startDate : `${startDate} - ${endDate}`;
  if (startDate === endDate) return formatDateParts(start, true);
  return `${formatDateParts(start, true)} - ${formatDateParts(end, start.year !== end.year)}`;
}
