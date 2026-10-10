"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneralForm, InstructionsForm, SettingsForm } from "./agent-forms";
import { KnowledgeTab } from "./knowledge-tab";
import { UnansweredTab } from "./unanswered-tab";
import { AgentPlayground } from "./agent-playground";
import type { AgentView, ChatMessageView, SourceView, UnansweredView } from "./types";

export function AgentTabs({
  slug,
  initialTab,
  agent,
  sources,
  unanswered,
  chat,
}: {
  slug: string;
  initialTab: string;
  agent: AgentView;
  sources: SourceView[];
  unanswered: UnansweredView[];
  chat: { status: string; messages: ChatMessageView[] };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState(initialTab);
  const open = unanswered.filter((q) => !q.resolved).length;

  return (
    <Tabs
      value={tab}
      onValueChange={(t) => {
        setTab(t);
        router.replace(`${pathname}?tab=${t}`, { scroll: false });
      }}
    >
      <TabsList className="h-auto flex-wrap">
        <TabsTrigger value="general">Основное</TabsTrigger>
        <TabsTrigger value="instructions">Инструкции</TabsTrigger>
        <TabsTrigger value="knowledge">База знаний ({sources.length})</TabsTrigger>
        <TabsTrigger value="testing">Тестирование</TabsTrigger>
        <TabsTrigger value="unanswered">Без ответа{open ? ` (${open})` : ""}</TabsTrigger>
        <TabsTrigger value="settings">Настройки</TabsTrigger>
      </TabsList>
      <TabsContent value="general" className="mt-4">
        <GeneralForm slug={slug} agent={agent} />
      </TabsContent>
      <TabsContent value="instructions" className="mt-4">
        <InstructionsForm slug={slug} agent={agent} />
      </TabsContent>
      <TabsContent value="knowledge" className="mt-4">
        <KnowledgeTab slug={slug} agentId={agent.id} sources={sources} />
      </TabsContent>
      <TabsContent value="testing" className="mt-4">
        <AgentPlayground slug={slug} agentId={agent.id} agentName={agent.name} messages={chat.messages} status={chat.status} />
      </TabsContent>
      <TabsContent value="unanswered" className="mt-4">
        <UnansweredTab slug={slug} questions={unanswered} />
      </TabsContent>
      <TabsContent value="settings" className="mt-4">
        <SettingsForm slug={slug} agent={agent} />
      </TabsContent>
    </Tabs>
  );
}
