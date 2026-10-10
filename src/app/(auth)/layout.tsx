import { Bot, GitBranch, Users, Workflow } from "lucide-react";
import { Logo } from "@/components/brand/logo";

const points = [
  { icon: Workflow, title: "Visual automation builder", text: "Design conversation flows with triggers, conditions and actions." },
  { icon: Bot, title: "AI agents grounded in your knowledge", text: "Answers come from your own docs and FAQs, with human handoff." },
  { icon: Users, title: "Built-in CRM", text: "Every conversation enriches a contact with tags and fields." },
  { icon: GitBranch, title: "Safe testing", text: "Simulate events end-to-end before anything goes live." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -left-40 size-[32rem] rounded-full bg-sidebar-primary/20 blur-3xl"
        />
        <Logo inverted />
        <div className="relative mt-auto max-w-md space-y-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Turn every conversation into an automated workflow.
          </h1>
          <ul className="space-y-5">
            {points.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-primary">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-medium text-white">{title}</span>
                  <span className="block text-sm text-sidebar-foreground/70">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative mt-12 text-xs text-sidebar-foreground/50">
          Local development build · messages are simulated, no external channels are connected.
        </p>
      </aside>
      <main className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
