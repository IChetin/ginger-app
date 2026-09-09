/** venue_local ISO → значение для input[type=datetime-local] */
export function toDatetimeLocalInput(venueLocal: string): string {
  const withoutOffset = venueLocal.replace(/([+-]\d{2}:\d{2}|Z)$/i, "");
  return withoutOffset.slice(0, 16);
}

/** datetime-local → ISO-строка для API (naive venue-local) */
export function fromDatetimeLocalInput(value: string): string {
  if (value.length === 16) {
    return `${value}:00`;
  }
  return value;
}
