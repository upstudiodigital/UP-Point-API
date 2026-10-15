// Check digits validate formatting/integrity, not identity or ownership.
export function validDocument(value: unknown): boolean {
  if (typeof value !== "string" || !/^[\d.\-/\s]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  if (![11, 14].includes(digits.length) || /^(\d)\1+$/.test(digits)) return false;
  const check = (length: number) => {
    const weights = digits.length === 11
      ? Array.from({ length }, (_, i) => length + 1 - i)
      : Array.from({ length }, (_, i) => (length - i - 1) % 8 + 2);
    const sum = weights.reduce((total, weight, i) => total + Number(digits[i]) * weight, 0);
    const remainder = sum % 11;
    return Number(digits[length]) === (remainder < 2 ? 0 : 11 - remainder);
  };
  return check(digits.length - 2) && check(digits.length - 1);
}
