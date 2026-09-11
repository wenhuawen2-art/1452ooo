const escapeText = (value) =>
  String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
const stamp = (time) =>
  new Date(time)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

// RFC 5545 counts octets, so fold Unicode titles without splitting a character.
export function foldLine(line) {
  const encoder = new TextEncoder();
  let result = "",
    width = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (width + size > 75) {
      result += "\r\n ";
      width = 1;
    }
    result += char;
    width += size;
  }
  return result;
}
export function calendarEvent(title, time, uid, revision = 0) {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}@suixing`,
    `SEQUENCE:${revision}`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(time + "+08:00")}`,
    `SUMMARY:${escapeText(title)}`,
    "BEGIN:VALARM",
    "TRIGGER:PT0M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(title)}`,
    "END:VALARM",
    "END:VEVENT",
  ]
    .map(foldLine)
    .join("\r\n");
}
export const calendarFile = (events) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "METHOD:PUBLISH",
    "PRODID:-//Suixing//Roadtrip//ZH",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:随行提醒",
    "X-WR-TIMEZONE:Asia/Shanghai",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
export const calendar = (title, time, uid, revision = 0) =>
  calendarFile([calendarEvent(title, time, uid, revision)]);
