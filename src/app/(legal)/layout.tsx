import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SiteFooter } from "@/components/brand/site-footer";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" aria-label="ChatSpot — главная">
            <Logo />
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground max-sm:gap-3 max-sm:text-xs">
            <Link href="/contacts" className="hover:text-foreground">
              Контакты
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Конфиденциальность
            </Link>
            <Link href="/data-deletion" className="hover:text-foreground">
              Удаление данных
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <article className="space-y-4 text-sm leading-relaxed text-foreground/90 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-foreground [&_h2]:pt-4 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc">
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
