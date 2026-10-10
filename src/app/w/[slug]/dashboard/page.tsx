import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  Circle,
  LayoutTemplate,
  MessagesSquare,
  PlayCircle,
  Target,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { AutomationStatusBadge } from "@/components/automations/status-badge";
import { NewAutomationButton, type TemplateOption } from "@/components/automations/new-automation-button";
import { requireUser, requireWorkspace } from "@/lib/server/auth/guards";
import { getDashboard } from "@/lib/server/services/dashboard";
import { listTemplates } from "@/lib/server/services/templates";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

type Props = PageProps<"/w/[slug]/dashboard">;

export default function DashboardPage({ params }: Props) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard params={params} />
    </Suspense>
  );
}

async function Dashboard({ params }: { params: Props["params"] }) {
  const { slug } = await params;
  const [ctx, user] = await Promise.all([requireWorkspace(slug), requireUser()]);
  const [d, templates] = await Promise.all([getDashboard(ctx), listTemplates(ctx)]);
  const templateOptions = templates.map((t) => ({ id: t.id, name: t.name, description: t.description, category: t.category }));
  const firstName = user.fullName.split(/\s+/)[0] || "there";
  const isNew = d.automations.total === 0 && d.contacts.total === 0;
  const successRate = d.executions.completed + d.executions.failed > 0
    ? Math.round((d.executions.completed / (d.executions.completed + d.executions.failed)) * 100)
    : null;

  return (
    <PageContainer>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={`Here's what's happening in ${ctx.workspaceName}.`}
        actions={<NewAutomationButton slug={slug} templates={templateOptions} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={Users}
          label="Total contacts"
          value={d.contacts.total}
          hint={d.contacts.demo > 0 ? `incl. ${d.contacts.demo} demo contacts` : "People who interacted with you"}
        />
        <Kpi
          icon={Workflow}
          label="Active automations"
          value={d.automations.active}
          hint={`${d.automations.total} total`}
          href={`/w/${slug}/automations?status=active`}
        />
        <Kpi
          icon={PlayCircle}
          label="Automation executions"
          value={d.executions.total}
          hint={
            d.executions.total === 0
              ? "No runs yet"
              : `${d.executions.last30} in the last 30 days${successRate !== null ? ` · ${successRate}% succeeded` : ""}`
          }
        />
        <Kpi icon={Target} label="Leads collected" value={d.contacts.leads} hint="Contacts with email, phone or qualified status" />
      </div>
      {d.executions.test > 0 && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Execution counts include {d.executions.test} test run{d.executions.test === 1 ? "" : "s"} from the simulator — no
          external channel is connected yet.
        </p>
      )}

      {isNew && <GettingStarted slug={slug} templates={templateOptions} />}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Automation performance</CardTitle>
            <CardDescription>Runs in the last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {d.perAutomation.length === 0 ? (
              <EmptyState
                compact
                icon={Workflow}
                title="No automations yet"
                description="Performance appears here once your automations start running."
              />
            ) : (
              <ul className="divide-y">
                {d.perAutomation.map((a) => {
                  const finished = a.completed + a.failed;
                  const rate = finished > 0 ? Math.round((a.completed / finished) * 100) : null;
                  return (
                    <li key={a.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <Link href={`/w/${slug}/automations/${a.id}`} className="block truncate text-sm font-medium hover:text-primary">
                          {a.name}
                        </Link>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                          <div className="h-full rounded-full bg-primary" style={{ width: `${rate ?? 0}%` }} />
                        </div>
                      </div>
                      <AutomationStatusBadge status={a.status} />
                      <div className="w-24 text-right text-xs tabular-nums text-muted-foreground">
                        <span className="block text-sm font-medium text-foreground">{a.runs} runs</span>
                        {rate !== null ? `${rate}% success` : "no runs"}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <NewAutomationButton slug={slug} templates={templateOptions} variant="outline" className="h-auto justify-start py-2.5">
              <Workflow className="text-primary" aria-hidden />
              <span className="text-left">
                <span className="block font-medium">Create an automation</span>
                <span className="block text-xs font-normal text-muted-foreground">Start from a blank starter flow</span>
              </span>
            </NewAutomationButton>
            <NewAutomationButton
              slug={slug}
              templates={templateOptions}
              initialMode="template"
              variant="outline"
              className="h-auto justify-start py-2.5"
            >
              <LayoutTemplate className="text-primary" aria-hidden />
              <span className="text-left">
                <span className="block font-medium">Start from a template</span>
                <span className="block text-xs font-normal text-muted-foreground">{templates.length} ready-made flows</span>
              </span>
            </NewAutomationButton>
            <div className="flex items-center gap-2 rounded-lg border border-dashed p-2.5 text-sm text-muted-foreground" aria-disabled>
              <Bot className="size-4" aria-hidden />
              <span>
                <span className="block font-medium">Create an AI agent</span>
                <span className="block text-xs">Available in implementation stage 6</span>
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {d.activity.length === 0 ? (
              <EmptyState compact icon={Activity} title="No activity yet" />
            ) : (
              <ol className="space-y-3">
                {d.activity.map((e) => (
                  <li key={e.id} className="flex gap-3 text-sm">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/60" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block">{e.summary}</span>
                      <RelativeTime date={e.createdAt} className="text-xs text-muted-foreground" />
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent conversations</CardTitle>
          </CardHeader>
          <CardContent>
            {d.recentConversations.length === 0 ? (
              <EmptyState
                compact
                icon={MessagesSquare}
                title="No conversations yet"
                description="Conversations from the channel simulator will show up here."
              />
            ) : (
              <ul className="divide-y">
                {d.recentConversations.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                      {(c.firstName?.[0] ?? "?").toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {[c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown contact"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{c.preview || "No messages"}</span>
                    </span>
                    {c.lastMessageAt && <RelativeTime date={c.lastMessageAt} className="text-xs text-muted-foreground" />}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

function Kpi({ icon: Icon, label, value, hint, href }: { icon: LucideIcon; label: string; value: number; hint: string; href?: string }) {
  const body = (
    <Card className={cn("h-full gap-0 py-4", href && "transition-colors hover:border-primary/40")}>
      <CardContent className="space-y-2 px-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{label}</span>
          <Icon className="size-4" aria-hidden />
        </div>
        <p className="text-3xl font-semibold tabular-nums tracking-tight">{value.toLocaleString("en")}</p>
        <p className="truncate text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  ) : (
    body
  );
}

function GettingStarted({ slug, templates }: { slug: string; templates: TemplateOption[] }) {
  const steps = [
    { done: true, title: "Create your workspace", text: "You're in! Everything here is private to this workspace." },
    { done: false, title: "Create your first automation", text: "Start from scratch or pick one of the ready-made templates." },
    { done: false, title: "Test it with a simulated message", text: "The test runner arrives with the execution engine (stage 5)." },
  ];
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-accent/60 to-card">
      <CardHeader>
        <CardTitle>Get started</CardTitle>
        <CardDescription>Three steps to your first working automation.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="space-y-3">
          {steps.map((s) => (
            <li key={s.title} className="flex gap-3">
              {s.done ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-label="Done" />
              ) : (
                <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground/50" aria-label="To do" />
              )}
              <span>
                <span className={cn("block text-sm font-medium", s.done && "text-muted-foreground line-through")}>{s.title}</span>
                <span className="block text-xs text-muted-foreground">{s.text}</span>
              </span>
            </li>
          ))}
        </ol>
        <NewAutomationButton slug={slug} templates={templates}>
          Create your first automation <ArrowRight aria-hidden />
        </NewAutomationButton>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <PageContainer>
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[118px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </PageContainer>
  );
}
