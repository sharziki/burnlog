export const DEFAULT_DOLLARS_PER_TOKEN = 0.00001;

export function dollarsPerToken() {
  const raw =
    process.env.NEXT_PUBLIC_BURNLOG_DOLLARS_PER_TOKEN ??
    process.env.BURNLOG_DOLLARS_PER_TOKEN;
  const rate = Number(raw);
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_DOLLARS_PER_TOKEN;
}
