// Sous-ensemble de Utilities.formatDate (yyyy MM dd HH mm ss)
function fmt(d, tz, pat) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return pat
    .replace("yyyy", p.year)
    .replace("MM", p.month)
    .replace("dd", p.day)
    .replace("HH", p.hour)
    .replace("mm", p.minute)
    .replace("ss", p.second);
}
module.exports = { fmt };
