import Link from "next/link";
import { ArrowRight, Bot, Inbox, MessageCircleHeart, Users, Workflow, Zap } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { SiteFooter } from "@/components/brand/site-footer";
import { Button } from "@/components/ui/button";
import { AuthShowcase } from "./(auth)/auth-showcase";

const features = [
  { icon: MessageCircleHeart, title: "Автоответы в Instagram Direct", text: "Мгновенно отвечайте на сообщения по ключевым словам — через официальный API Instagram." },
  { icon: Workflow, title: "Визуальный конструктор", text: "Собирайте сценарии из триггеров, условий, сообщений и действий — без программирования." },
  { icon: Bot, title: "ИИ-агенты", text: "Агент отвечает по вашей базе знаний и передаёт сложные вопросы сотруднику." },
  { icon: Users, title: "Встроенная CRM", text: "Каждый диалог пополняет карточку клиента: теги, поля, статус лида." },
  { icon: Inbox, title: "Единые входящие", text: "Все переписки в одном месте: отвечайте вручную, оставляйте заметки, назначайте ответственных." },
  { icon: Zap, title: "Готовые шаблоны", text: "Лид-магнит, запись на услугу, продажа курса — запустите за пару минут." },
];

const steps = [
  { n: "1", title: "Подключите Instagram", text: "Профессиональный аккаунт подключается в один клик через вход Instagram." },
  { n: "2", title: "Выберите сценарий", text: "Возьмите шаблон или соберите свой в конструкторе." },
  { n: "3", title: "Включите автоответы", text: "Клиенты получают ответ сразу, а заявки попадают в CRM." },
];

/** Public home page for visitors who aren't signed in. */
export function Landing() {
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Войти</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Начать бесплатно</Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[oklch(0.15_0.02_286)] text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="cs-blob absolute -top-32 -left-24 size-[30rem] rounded-full bg-violet-600/35 blur-3xl" />
          <div className="cs-blob absolute top-1/4 -right-32 size-[26rem] rounded-full bg-fuchsia-500/25 blur-3xl [animation-delay:-6s]" />
          <div className="cs-blob absolute -bottom-40 left-1/3 size-[28rem] rounded-full bg-sky-500/20 blur-3xl [animation-delay:-12s]" />
          <div className="absolute inset-0 bg-[radial-gradient(oklch(1_0_0/0.09)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)] bg-[size:22px_22px]" />
        </div>
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div className="space-y-6">
            <span className="inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/75">Для авторов и малого бизнеса</span>
            <h1 className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl">
              Каждый диалог в Direct —{" "}
              <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-amber-200 bg-clip-text text-transparent">автоматический сценарий</span>
            </h1>
            <p className="max-w-lg text-lg leading-relaxed text-white/70">
              ChatSpot отвечает клиентам в Instagram мгновенно, собирает заявки в CRM и передаёт сложные вопросы вашей команде.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-11 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-5 text-white shadow-lg shadow-violet-500/30 hover:opacity-95">
                <Link href="/signup">
                  Создать аккаунт <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-11 rounded-xl border-white/20 bg-white/5 px-5 text-white hover:bg-white/10 hover:text-white">
                <Link href="/login">У меня есть аккаунт</Link>
              </Button>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <AuthShowcase />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="mb-10 max-w-2xl space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight">Всё для общения с клиентами</h2>
          <p className="text-muted-foreground">Один инструмент вместо ручных ответов, таблиц и забытых заявок.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-2xl border bg-card p-5 shadow-xs transition-shadow hover:shadow-md">
              <span className="mb-4 flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="font-medium">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y bg-card">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="mb-10 text-3xl font-semibold tracking-tight">Как это работает</h2>
          <ol className="grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-500 font-semibold text-white">
                  {s.n}
                </span>
                <span>
                  <span className="block font-medium">{s.title}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-[oklch(0.15_0.02_286)] px-6 py-12 text-center text-white sm:px-12">
          <div aria-hidden className="cs-blob pointer-events-none absolute -top-24 left-1/2 size-[24rem] -translate-x-1/2 rounded-full bg-violet-600/40 blur-3xl" />
          <h2 className="relative text-3xl font-semibold tracking-tight">Запустите первый автоответ сегодня</h2>
          <p className="relative mx-auto mt-2 max-w-md text-white/70">Регистрация занимает минуту, а готовые шаблоны помогут начать без настройки с нуля.</p>
          <Button asChild size="lg" className="relative mt-6 h-11 rounded-xl bg-white px-6 text-zinc-900 hover:bg-white/90">
            <Link href="/signup">
              Начать бесплатно <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
