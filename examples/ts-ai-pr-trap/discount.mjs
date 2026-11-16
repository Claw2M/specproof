export function calculateDiscount(seats, total) {
  if (seats >= 5) {
    return total * 0.85;
  }
  return total;
}

export function parseConfigSafe(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.log(err);
  }
}
