"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field, fieldA11y } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { signInAction, signUpAction, type AuthFormState } from "./actions";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action] = useActionState<AuthFormState, FormData>(
    mode === "login" ? signInAction : signUpAction,
    null,
  );
  // Controlled so values survive React's automatic form reset after a failed submit.
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const errors = state && !state.ok ? state.fieldErrors ?? {} : {};
  const formError = state && !state.ok ? state.error : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "login" ? "С возвращением" : "Создайте рабочее пространство"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {mode === "login"
            ? "Войдите, чтобы управлять автоматизациями и агентами."
            : "Настройте первую автоматизацию переписки за несколько минут."}
        </p>
      </div>

      <form action={action} className="space-y-4" noValidate>
        {formError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{formError}</span>
          </div>
        )}
        {mode === "signup" && (
          <Field id="fullName" label="Имя и фамилия" error={errors.fullName}>
            <Input {...fieldA11y("fullName", errors.fullName)} autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-9" />
          </Field>
        )}
        <Field id="email" label="Эл. почта" error={errors.email}>
          <Input {...fieldA11y("email", errors.email)} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
        </Field>
        <Field
          id="password"
          label="Пароль"
          error={errors.password}
          hint={mode === "signup" ? "Не менее 8 символов." : undefined}
        >
          <Input
            {...fieldA11y("password", errors.password)}
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            className="h-9"
          />
        </Field>
        <SubmitButton className="h-9 w-full" pendingLabel={mode === "login" ? "Входим…" : "Создаём аккаунт…"}>
          {mode === "login" ? "Войти" : "Создать аккаунт"}
        </SubmitButton>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            Впервые в ChatSpot?{" "}
            <Link href="/signup" className="font-medium text-primary hover:underline">
              Зарегистрироваться
            </Link>
          </>
        ) : (
          <>
            Уже есть аккаунт?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Войти
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
