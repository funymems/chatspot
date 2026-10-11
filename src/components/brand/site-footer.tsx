import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { COMPANY } from "@/lib/company";
import { cn } from "@/lib/utils";

/** Public footer with the operator's legal details (shown on the landing and legal pages). */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("border-t bg-card", className)}>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm sm:grid-cols-[1.4fr_1fr_1fr] sm:px-6">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-muted-foreground">Автоматизация переписки в Instagram Direct, CRM и ИИ-агенты для авторов и малого бизнеса.</p>
        </div>
        <div className="space-y-2">
          <p className="font-medium">Компания</p>
          <address className="space-y-1 not-italic text-muted-foreground">
            <span className="block">{COMPANY.legalName}</span>
            <span className="block">{COMPANY.cityRu}</span>
            <a href={COMPANY.phoneHref} className="block hover:text-foreground">
              {COMPANY.phone}
            </a>
            <a href={`mailto:${COMPANY.email}`} className="block hover:text-foreground">
              {COMPANY.email}
            </a>
          </address>
        </div>
        <nav className="space-y-2" aria-label="Документы">
          <p className="font-medium">Документы</p>
          <Link href="/contacts" className="block text-muted-foreground hover:text-foreground">
            Контакты
          </Link>
          <Link href="/privacy" className="block text-muted-foreground hover:text-foreground">
            Политика конфиденциальности
          </Link>
          <Link href="/data-deletion" className="block text-muted-foreground hover:text-foreground">
            Удаление данных
          </Link>
        </nav>
      </div>
      <div className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted-foreground sm:px-6">ChatSpot · {COMPANY.legalName} · {COMPANY.cityRu}</p>
      </div>
    </footer>
  );
}
