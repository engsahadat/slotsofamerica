import { z } from "zod";

// Transaction form validation
export const transactionSchema = z.object({
  // IDs are now plain auto-increment integers (Laravel), not Postgres UUIDs.
  gameId: z.coerce.string().min(1, "Please select a valid game"),
  type: z.enum(["deposit", "withdraw", "redeem", "transfer"], {
    errorMap: () => ({ message: "Invalid transaction type" }),
  }),
  amount: z
    .number({ invalid_type_error: "Amount must be a number" })
    .positive("Amount must be greater than $0")
    .max(100000, "Amount cannot exceed $100,000")
    .multipleOf(0.01, "Amount must have at most 2 decimal places"),
});

export type TransactionFormData = z.infer<typeof transactionSchema>;

// Password request validation
export const passwordRequestSchema = z.object({
  // IDs are now plain auto-increment integers (Laravel), not Postgres UUIDs.
  gameAccountId: z.coerce.string().min(1, "Please select a valid game account"),
});

export type PasswordRequestFormData = z.infer<typeof passwordRequestSchema>;

// Admin password update validation
export const adminPasswordUpdateSchema = z.object({
  // IDs are now plain auto-increment integers (Laravel), not Postgres UUIDs.
  requestId: z.coerce.string().min(1, "Invalid request id"),
  newPassword: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(128, "Password cannot exceed 128 characters"),
});

export type AdminPasswordUpdateData = z.infer<typeof adminPasswordUpdateSchema>;

// Login validation
export const loginSchema = z.object({
  email: z.string().trim().email("Please enter a valid email address").max(255),
  password: z.string().min(1, "Password is required").max(128),
});

export type LoginFormData = z.infer<typeof loginSchema>;

// Registration validation
export const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(6, "Username must be at least 6 characters")
    .max(10, "Username cannot exceed 10 characters")
    .regex(/^[a-zA-Z0-9]+$/, "Username can only contain letters and numbers"),
  email: z.string().trim().email("Please enter a valid email address").max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password cannot exceed 128 characters"),
});

export type RegisterFormData = z.infer<typeof registerSchema>;

// Generic sanitizer for text inputs
export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 1000);
}

// Safe error parsing for objects, strings, errors
export function parseApiError(error: unknown): string {
  if (!error) return "An unexpected error occurred";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const errObj = error as any;
    if (errObj.error && typeof errObj.error === "string") return errObj.error;
    if (errObj.message && typeof errObj.message === "string") return errObj.message;
  }
  return "An unexpected error occurred";
}
