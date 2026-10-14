// The "Delete my account" dialog only enables its button once the user has
// typed this word exactly (surrounding spaces ignored, case-sensitive).
export const DELETE_CONFIRMATION_WORD = "DELETE";

export function isDeleteConfirmation(text: string | null | undefined): boolean {
  return typeof text === "string" && text.trim() === DELETE_CONFIRMATION_WORD;
}
