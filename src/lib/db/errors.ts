import type { SupabaseErrorShape } from "@/lib/types";

export function getSupabaseErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return String(error ?? "Unknown Supabase error");
  const shaped = error as SupabaseErrorShape;
  const parts = [shaped.code, shaped.message, shaped.details, shaped.hint].filter(Boolean);
  if (parts.length > 0) return parts.join(" | ");
  try {
    const json = JSON.stringify(error);
    return json && json !== "{}" ? json : "Unknown Supabase error";
  } catch {
    return "Unknown Supabase error";
  }
}

export function formatSupabaseError(error: unknown) {
  return getSupabaseErrorMessage(error);
}

export function isMissingColumnError(error: unknown, columnName: string) {
  if (!error || typeof error !== "object") return false;
  const shaped = error as SupabaseErrorShape;
  const message = getSupabaseErrorMessage(error);
  return (
    message.includes(columnName) &&
    (
      shaped.code === "42703" ||
      shaped.code?.startsWith("PGRST") ||
      message.toLowerCase().includes("column")
    )
  );
}
