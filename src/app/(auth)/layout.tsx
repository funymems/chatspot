import { Bot, MessageCircleHeart, Workflow } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { AuthShowcase } from "./auth-showcase";

const perks = [
  { icon: MessageCircleHeart, text: "Instagram Direct" },
  { icon: Workflow, text: "Визуальные сценарии" },
  { icon: Bot, text: "ИИ-агенты" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[1.05fr_1fr]">
      <aside className="sticky top-0 hidden h-svh overflow-hidden bg-[oklch(0.15_0.02_286)] p-10 text-white lg:flex lg:flex-col xl:px-14">
        {/* Drifting colour fields */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="cs-blob absolute -top-32 -left-24 size-[30rem] rounded-full bg-violet-600/35 blur-3xl" />
          <div className="cs-blob absolute top-1/3 -right-32 size-[26rem] rounded-full bg-fuchsia-500/25 blur-3xl [animation-delay:-6s]" />
          <div className="cs-blob absolute -bottom-40 left-1/4 size-[28rem] rounded-full bg-sky-500/20 blur-3xl [animation-delay:-12s]" />
          <div className="absolute inset-0 bg-[radial-gradient(oklch(1_0_0/0.09)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)] bg-[size:22px_22px]" />
        </div>

        <div className="relative flex items-center justify-between">
          <Logo inverted />
          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70 backdrop-blur">для авторов и малого бизнеса</span>
        </div>

        <div className="relative my-auto grid items-center gap-7 py-6 2xl:grid-cols-[1fr_auto] 2xl:gap-14">
          <div className="max-w-md space-y-4">
            <h1 className="text-4xl leading-[1.1] font-semibold tracking-tight text-balance 2xl:text-[2.75rem]">
              Каждый диалог —{" "}
              <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-amber-200 bg-clip-text text-transparent">автоматический сценарий</span>
            </h1>
            <p className="text-[15px] leading-relaxed text-white/65">
              Отвечайте в Direct мгновенно, собирайте заявки и передавайте сложные вопросы команде — без кода и без дежурств в телефоне.
            </p>
            <ul className="flex flex-wrap gap-2">
              {perks.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80">
                  <Icon className="size-3.5 text-violet-300" aria-hidden /> {text}
                </li>
              ))}
            </ul>
          </div>
          <AuthShowcase />
        </div>

        <p className="relative text-xs text-white/40">ChatSpot · автоматизация переписки</p>
      </aside>

      <main className="relative flex items-center justify-center overflow-hidden px-4 py-12 sm:px-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 right-[-10rem] size-[28rem] rounded-full bg-violet-400/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,oklch(0.52_0.2_291/0.05)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.52_0.2_291/0.05)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_top_right,black_10%,transparent_60%)] bg-[size:40px_40px]"
        />
        <div className="relative w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
