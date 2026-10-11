import type { Metadata } from "next";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = { title: "Контакты" };

export default function ContactsPage() {
  return (
    <>
      <h1>Контакты</h1>
      <p>
        ChatSpot — сервис автоматизации переписки в Instagram Direct, CRM и ИИ-агентов для авторов и малого бизнеса. Ниже указаны данные владельца
        сервиса и способы связи.
      </p>

      <h2>Владелец сервиса</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        <dt className="text-muted-foreground">Имя</dt>
        <dd>{COMPANY.legalName}</dd>
        <dt className="text-muted-foreground">Город</dt>
        <dd>{COMPANY.cityRu}</dd>
        <dt className="text-muted-foreground">Телефон</dt>
        <dd>
          <a href={COMPANY.phoneHref} className="text-primary hover:underline">
            {COMPANY.phone}
          </a>
        </dd>
        <dt className="text-muted-foreground">Эл. почта</dt>
        <dd>
          <a href={`mailto:${COMPANY.email}`} className="text-primary hover:underline">
            {COMPANY.email}
          </a>
        </dd>
        <dt className="text-muted-foreground">Сайт</dt>
        <dd>
          <a href={COMPANY.site} className="text-primary hover:underline">
            {COMPANY.site.replace("https://", "")}
          </a>
        </dd>
      </dl>

      <h2>Поддержка</h2>
      <p>По вопросам работы сервиса, данных и сотрудничества пишите на почту — мы отвечаем в течение одного рабочего дня.</p>
    </>
  );
}
