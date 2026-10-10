import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { SearchFilter, SelectFilter } from "@/components/common/url-filters";
import { ContactsIcon } from "@/components/brand/nav-icons";
import { NewContactButton } from "@/components/contacts/new-contact-button";
import { contactSourceLabels, LeadStatusBadge, TagChip, contactName, leadStatusOptions } from "@/components/contacts/lead-status";
import { requireWorkspace } from "@/lib/server/auth/guards";
import { contactSorts, leadStatuses, listContacts, listTags, type ContactSort, type LeadStatus } from "@/lib/server/services/contacts";

export const metadata: Metadata = { title: "Контакты" };

type Props = PageProps<"/w/[slug]/contacts">;

export default function ContactsPage({ params, searchParams }: Props) {
  return (
    <PageContainer>
      <Suspense fallback={<Skeleton className="h-14 rounded-xl" />}>
        <Header params={params} />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <ContactTable params={params} searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  );
}

async function Header({ params }: { params: Props["params"] }) {
  const { slug } = await params;
  const ctx = await requireWorkspace(slug);
  const tags = await listTags(ctx);
  return (
    <>
      <PageHeader title="Контакты" description="Все, кто общался с вашим рабочим пространством." actions={<NewContactButton slug={slug} />} />
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchFilter placeholder="Поиск по имени, почте или телефону" />
        <SelectFilter param="tag" label="Фильтр по тегу" allLabel="Все теги" options={tags.map((t) => ({ value: t.name, label: `${t.name} (${t.uses})` }))} />
        <SelectFilter param="status" label="Фильтр по статусу" allLabel="Все статусы" options={leadStatusOptions} />
        <SelectFilter
          param="sort"
          label="Сортировка"
          allLabel="Сначала новые"
          options={[
            { value: "oldest", label: "Сначала старые" },
            { value: "name", label: "По имени (А–Я)" },
            { value: "last_interaction", label: "По последнему общению" },
          ]}
        />
      </div>
    </>
  );
}

async function ContactTable({ params, searchParams }: Pick<Props, "params" | "searchParams">) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireWorkspace(slug);
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const status = leadStatuses.find((s) => s === str("status")) as LeadStatus | undefined;
  const sort = contactSorts.find((s) => s === str("sort")) as ContactSort | undefined;
  const page = Math.max(1, Number(str("page")) || 1);
  const res = await listContacts(ctx, { q: str("q"), tag: str("tag"), status, sort, page });
  const filtered = Boolean(str("q") || str("tag") || status);

  if (res.total === 0) {
    return filtered ? (
      <EmptyState
        icon={SearchX}
        title="Ничего не найдено"
        description="Попробуйте другой запрос или фильтр."
        action={
          <Button variant="outline" asChild>
            <Link href={`/w/${slug}/contacts`}>Сбросить фильтры</Link>
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={ContactsIcon}
        title="Контактов пока нет"
        description="Контакты появляются автоматически, когда вам пишут через канал (или через симулятор в «Диалогах»). Их также можно добавить вручную."
        action={<NewContactButton slug={slug} />}
      />
    );
  }

  const pageHref = (p: number) => {
    const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"));
    q.set("page", String(p));
    return `/w/${slug}/contacts?${q}`;
  };

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Имя</th>
              <th className="hidden px-4 py-2.5 font-medium md:table-cell">Почта / телефон</th>
              <th className="px-4 py-2.5 font-medium">Статус</th>
              <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Теги</th>
              <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Источник</th>
              <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Последнее общение</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {res.rows.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="w-full max-w-0 px-4 py-3">
                  <Link href={`/w/${slug}/contacts/${c.id}`} className="block truncate font-medium hover:text-primary">
                    {contactName(c)}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    Добавлен <RelativeTime date={c.createdAt} />
                  </p>
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                  <span className="block truncate">{c.email ?? "—"}</span>
                  <span className="block truncate text-xs">{c.phone ?? ""}</span>
                </td>
                <td className="px-4 py-3">
                  <LeadStatusBadge status={c.leadStatus} />
                </td>
                <td className="hidden px-4 py-3 lg:table-cell">
                  <div className="flex max-w-56 flex-wrap gap-1">
                    {c.tags.slice(0, 4).map((t) => (
                      <TagChip key={t} name={t} />
                    ))}
                    {c.tags.length > 4 && <span className="text-xs text-muted-foreground">+{c.tags.length - 4}</span>}
                  </div>
                </td>
                <td className="hidden px-4 py-3 text-xs text-muted-foreground sm:table-cell">{contactSourceLabels[c.source] ?? c.source}</td>
                <td className="hidden px-4 py-3 whitespace-nowrap text-muted-foreground lg:table-cell">
                  {c.lastInteractionAt ? <RelativeTime date={c.lastInteractionAt} /> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav className="flex items-center justify-between text-sm text-muted-foreground" aria-label="Страницы">
        <span>
          {(res.page - 1) * res.pageSize + 1}–{Math.min(res.page * res.pageSize, res.total)} из {res.total}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild={res.page > 1} disabled={res.page <= 1}>
            {res.page > 1 ? (
              <Link href={pageHref(res.page - 1)}>
                <ChevronLeft aria-hidden /> Назад
              </Link>
            ) : (
              <span>
                <ChevronLeft aria-hidden /> Назад
              </span>
            )}
          </Button>
          <Button variant="outline" size="sm" asChild={res.page < res.pages} disabled={res.page >= res.pages}>
            {res.page < res.pages ? (
              <Link href={pageHref(res.page + 1)}>
                Далее <ChevronRight aria-hidden />
              </Link>
            ) : (
              <span>
                Далее <ChevronRight aria-hidden />
              </span>
            )}
          </Button>
        </div>
      </nav>
    </div>
  );
}
