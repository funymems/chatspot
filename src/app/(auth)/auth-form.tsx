"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail, Sparkles, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field, fieldA11y } from "@/components/forms/field";
import { SubmitButton } from "@/components/forms/submit-button";
import { cn } from "@/lib/utils";
import { signInAction, signUpAction, type AuthFormState } from "./actions";

const inputClass = "h-11 rounded-xl bg-card pl-10 shadow-xs transition-shadow focus-visible:shadow-md focus-visible:shadow-primary/10";

function IconInput({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="group/input relative">
      <Icon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground transition-colors group-focus-within/input:text-primary" aria-hidden />
      {children}
    </div>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const [state, action] = useActionState<AuthFormState, FormData>(mode === "login" ? signInAction : signUpAction, null);
  // Controlled so values survive React's automatic form reset after a failed submit.
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const errors = state && !state.ok ? state.fieldErrors ?? {} : {};
  const formError = state && !state.ok ? state.error : null;
  const signup = mode === "signup";

  return (
    <div className="cs-rise space-y-7">
      <div className="space-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground">
          <Sparkles className="size-3.5" aria-hidden />
          {signup ? "Первая автоматизация — за 5 минут" : "Рады видеть вас снова"}
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">{signup ? "Создайте аккаунт" : "Вход в ChatSpot"}</h1>
        <p className="text-sm text-muted-foreground">
          {signup ? "Подключите Instagram и настройте автоответы — без кода." : "Войдите, чтобы управлять автоматизациями, диалогами и агентами."}
        </p>
      </div>

      <form action={action} className="space-y-4" noValidate>
        {formError && (
          <div role="alert" className="cs-rise flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{formError}</span>
          </div>
        )}
        {signup && (
          <Field id="fullName" label="Имя и фамилия" error={errors.fullName}>
            <IconInput icon={UserRound}>
              <Input
                {...fieldA11y("fullName", errors.fullName)}
                autoComplete="name"
                required
                placeholder="Айгерим Садыкова"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClass}
              />
            </IconInput>
          </Field>
        )}
        <Field id="email" label="Эл. почта" error={errors.email}>
          <IconInput icon={Mail}>
            <Input
              {...fieldA11y("email", errors.email)}
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </IconInput>
        </Field>
        <Field id="password" label="Пароль" error={errors.password} hint={signup ? "Не менее 8 символов." : undefined}>
          <IconInput icon={Lock}>
            <Input
              {...fieldA11y("password", errors.password)}
              type={showPassword ? "text" : "password"}
              autoComplete={signup ? "new-password" : "current-password"}
              required
              placeholder="••••••••"
              className={cn(inputClass, "pr-11")}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              aria-pressed={showPassword}
              className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </IconInput>
        </Field>
        <SubmitButton
          className="group/submit relative h-11 w-full overflow-hidden rounded-xl bg-gradient-to-r from-violet-600 via-violet-500 to-fuchsia-500 text-[15px] font-medium text-white shadow-lg shadow-violet-500/25 transition-[transform,box-shadow] hover:shadow-xl hover:shadow-violet-500/30 active:scale-[0.99]"
          pendingLabel={signup ? "Создаём аккаунт…" : "Входим…"}
        >
          <span aria-hidden className="cs-shine pointer-events-none absolute inset-0" />
          <span className="relative flex items-center gap-1.5">
            {signup ? "Создать аккаунт" : "Войти"}
            <ArrowRight className="size-4 transition-transform group-hover/submit:translate-x-0.5" aria-hidden />
          </span>
        </SubmitButton>
      </form>

      <div className="relative text-center text-sm text-muted-foreground">
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-border" />
        <span className="relative bg-background px-3">
          {signup ? "Уже есть аккаунт?" : "Впервые в ChatSpot?"}{" "}
          <Link href={signup ? "/login" : "/signup"} className="font-medium text-primary underline-offset-4 hover:underline">
            {signup ? "Войти" : "Зарегистрироваться"}
          </Link>
        </span>
      </div>

      {signup && (
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          Регистрируясь, вы соглашаетесь с{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
            политикой конфиденциальности
          </Link>
          .
        </p>
      )}
    </div>
  );
}
