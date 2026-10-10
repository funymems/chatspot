import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).pipe(z.string().max(254));

export const signUpSchema = z.object({
  fullName: z.string().trim().min(1, "Enter your name").max(100),
  email: emailSchema,
  password: z.string().min(8, "Use at least 8 characters").max(200),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(200),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
