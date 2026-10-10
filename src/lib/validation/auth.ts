import { z } from "zod";
import "./locale";

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Введите корректный адрес эл. почты")).pipe(z.string().max(254));

export const signUpSchema = z.object({
  fullName: z.string().trim().min(1, "Введите имя").max(100),
  email: emailSchema,
  password: z.string().min(8, "Пароль должен содержать не менее 8 символов").max(200),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Введите пароль").max(200),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
