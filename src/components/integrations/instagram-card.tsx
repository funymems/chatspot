"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert, Copy, Inbox, Loader2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RelativeTime } from "@/components/common/relative-time";
import { disconnectInstagramAction, pullInstagramMessagesAction, setInstagramAutoReplyAction, startInstagramConnectAction } from "@/app/actions/integrations";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type InstagramCardProps = {
  slug: string;
  canManage: boolean;
  missingConfig: string[];
  callbackUrl: string | null;
  verifyTokenConfigured: boolean;
  connection: {
    username: string;
    status: "active" | "token_expired" | "error" | "disconnected";
    tokenExpiresAt: string | null;
    grantedScopes: string[];
    webhookSubscribedAt: string | null;
    lastWebhookAt: string | null;
    lastError: string | null;
    autoReplyEnabled: boolean;
  } | null;
  flash: { kind: "success" | "error" | "warning"; text: string } | null;
  diagnostics: {
    ownIdHints: string[];
    receipts: { receivedAt: string; outcome: string; httpStatus: number; eventKinds: string[]; eventCount: number; mine: boolean; idHint: string | null }[];
  } | null;
};

const outcomeText: Record<string, { label: string; tone: "ok" | "bad" | "warn"; help?: string }> = {
  accepted: { label: "Принято", tone: "ok", help: "Сохранено в «Диалоги» (копии ваших собственных сообщений не учитываются)." },
  bad_signature: {
    label: "Отклонено: неверная подпись",
    tone: "bad",
    help: "Meta подписала запрос секретом, которого нет на сервере. Добавьте META_APP_SECRET в Vercel (Настройки приложения → Основное → Секрет приложения) и выполните повторный деплой.",
  },
  unknown_account: { label: "Пропущено: аккаунт не подключён", tone: "warn", help: "Событие относится к аккаунту Instagram, который не подключён ни к одному рабочему пространству." },
  not_configured: { label: "Отклонено: сервер не настроен", tone: "bad", help: "На сервере не задан INSTAGRAM_APP_SECRET." },
  invalid_json: { label: "Отклонено: некорректный JSON", tone: "bad" },
  invalid_payload: { label: "Отклонено: неожиданный формат данных", tone: "bad" },
  ignored_object: { label: "Пропущено: это не событие Instagram", tone: "warn" },
};

const kindText: Record<string, string> = {
  message: "сообщение",
  echo: "ваше сообщение",
  deleted: "удаление",
  postback: "нажатие кнопки",
  reaction: "реакция",
  read: "прочтение",
  referral: "переход по ссылке",
  comment: "комментарий",
  unknown: "неизвестное событие",
};

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.3" cy="6.7" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function InstagramCard(p: InstagramCardProps) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const c = p.connection;
  const configured = p.missingConfig.length === 0;
  const needsReconnect = c && c.status !== "active";

  const connect = () =>
    start(async () => {
      const res = await startInstagramConnectAction(p.slug);
      if (!res.ok) return void toast.error(res.error);
      window.location.assign(res.data.url); // leave the app for Instagram's consent screen
    });

  return (
    <Card id="integrations">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <InstagramGlyph className="size-5 text-pink-600" /> Instagram
        </CardTitle>
        <CardDescription>Подключите профессиональный аккаунт (бизнес или автор), чтобы получать сообщения из Direct во входящие.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {p.flash && (
          <p
            role="status"
            className={cn(
              "flex items-start gap-2 rounded-lg p-3 text-sm",
              p.flash.kind === "success" && "bg-success/10 text-success",
              p.flash.kind === "error" && "bg-destructive/10 text-destructive",
              p.flash.kind === "warning" && "bg-warning/15 text-amber-800",
            )}
          >
            {p.flash.kind === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <CircleAlert className="mt-0.5 size-4 shrink-0" />}
            {p.flash.text}
          </p>
        )}

        {c ? (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">@{c.username || "неизвестно"}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  c.status === "active" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                )}
              >
                {c.status === "active" ? "Подключён" : c.status === "token_expired" ? "Нужно переподключить" : c.status === "error" ? "Ошибка" : "Отключён"}
              </span>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Токен доступа</dt>
              <dd>{c.tokenExpiresAt ? <>истекает <RelativeTime date={c.tokenExpiresAt} /> (продлевается автоматически)</> : "—"}</dd>
              <dt className="text-muted-foreground">Разрешения</dt>
              <dd className="break-words">{c.grantedScopes.join(", ") || "—"}</dd>
              <dt className="text-muted-foreground">Подписка на вебхуки</dt>
              <dd>{c.webhookSubscribedAt ? <>подтверждена Meta <RelativeTime date={c.webhookSubscribedAt} /></> : <span className="text-amber-700">не подтверждена</span>}</dd>
              <dt className="text-muted-foreground">Последнее событие</dt>
              <dd>{c.lastWebhookAt ? <RelativeTime date={c.lastWebhookAt} /> : "пока не было"}</dd>
            </dl>
            {c.lastError && (
              <p className="flex items-start gap-2 rounded-md bg-destructive/5 p-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {c.lastError}
              </p>
            )}
            <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 p-2.5">
              <span className="text-xs">
                <span className="block text-sm font-medium">Автоответы</span>
                {c.autoReplyEnabled
                  ? "Включены — активные автоматизации отвечают на входящие сообщения в Instagram (в пределах 24-часового окна Meta)."
                  : "Выключены — сообщения попадают только в «Диалоги», автоматически ничего не отправляется."}
              </span>
              <Switch
                checked={c.autoReplyEnabled}
                disabled={!p.canManage || pending || c.status !== "active"}
                aria-label="Автоответы в Instagram"
                onCheckedChange={(v) =>
                  start(async () => {
                    const res = await setInstagramAutoReplyAction(p.slug, v);
                    if (res.ok) toast.success(res.message);
                    else toast.error(res.error);
                  })
                }
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Аккаунт Instagram не подключён.</p>
        )}

        {!configured && (
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            Сервер ещё не настроен для Instagram. Не заданы переменные окружения: <span className="font-mono">{p.missingConfig.join(", ")}</span>.
          </p>
        )}

        {p.canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button onClick={connect} disabled={pending || !configured}>
              {pending ? <Loader2 className="animate-spin" /> : <InstagramGlyph className="size-4" />}
              {c ? (needsReconnect ? "Переподключить Instagram" : "Переподключить / сменить аккаунт") : "Подключить Instagram"}
            </Button>
            {c && c.status === "active" && (
              <Button
                variant="outline"
                disabled={pending}
                title="Загрузить последние сообщения напрямую из Instagram — работает, даже если вебхуки не приходят (например, приложение Meta не опубликовано)"
                onClick={() =>
                  start(async () => {
                    const res = await pullInstagramMessagesAction(p.slug);
                    if (res.ok) toast.success(res.message);
                    else toast.error(res.error);
                  })
                }
              >
                <Inbox /> Проверить новые сообщения
              </Button>
            )}
            {c && (
              <Button variant="outline" onClick={() => setConfirm(true)} disabled={pending}>
                <Unplug /> Отключить
              </Button>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Управлять интеграциями могут только владельцы и администраторы.</p>
        )}

        {p.diagnostics && c && (
          <details className="rounded-lg border p-3 text-sm" open={p.diagnostics.receipts.some((r) => r.outcome !== "accepted")}>
            <summary className="cursor-pointer font-medium">Последние входящие вебхуки</summary>
            <div className="mt-3 space-y-2 text-xs">
              {p.diagnostics.receipts.length === 0 ? (
                <div className="space-y-1 text-muted-foreground">
                  <p className="font-medium text-amber-700">Запросы от Meta на сервер пока не поступали.</p>
                  <p>Проверьте в панели приложения Meta: приложение опубликовано, подписка на поле вебхука «messages» включена, а сообщение отправлено не с самого подключённого аккаунта. Пока приложение в режиме разработки, у отправителя тоже должна быть роль в приложении.</p>
                </div>
              ) : (
                <ul className="divide-y rounded-md border">
                  {p.diagnostics.receipts.map((r, i) => {
                    const o = outcomeText[r.outcome] ?? { label: r.outcome, tone: "warn" as const };
                    return (
                      <li key={i} className="space-y-0.5 p-2">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className={cn("font-medium", o.tone === "ok" ? "text-success" : o.tone === "bad" ? "text-destructive" : "text-amber-700")}>{o.label}</span>
                          <span className="text-muted-foreground">HTTP {r.httpStatus}</span>
                          {r.eventCount > 0 && <span className="text-muted-foreground">· {r.eventKinds.map((k) => kindText[k] ?? k).join(", ")}</span>}
                          {r.idHint && <span className="text-muted-foreground">· аккаунт {r.idHint}</span>}
                          <RelativeTime date={r.receivedAt} className="ml-auto text-muted-foreground" />
                        </p>
                        {o.help && <p className="text-muted-foreground">{o.help}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-muted-foreground">ID подключённого аккаунта: {p.diagnostics.ownIdHints.join(", ") || "—"}. Текст сообщений здесь не сохраняется.</p>
            </div>
          </details>
        )}

        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Настройка вебхука в Meta</summary>
          <div className="mt-3 space-y-2 text-xs">
            <p>В панели приложения Meta → Instagram → «Настройка API для входа в Instagram» → «Настройте Webhooks» укажите:</p>
            <p className="font-medium">URL обратного вызова</p>
            {p.callbackUrl ? (
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted px-2 py-1">{p.callbackUrl}</code>
                <Button size="icon-sm" variant="ghost" aria-label="Скопировать URL обратного вызова" onClick={() => navigator.clipboard.writeText(p.callbackUrl!).then(() => toast.success("Скопировано"))}>
                  <Copy />
                </Button>
              </div>
            ) : (
              <p className="text-amber-700">Укажите в APP_BASE_URL публичный HTTPS-домен, чтобы увидеть точный адрес (https://ВАШ-ДОМЕН/api/webhooks/instagram).</p>
            )}
            {p.callbackUrl?.startsWith("http://") && <p className="text-amber-700">Meta требует HTTPS с действительным сертификатом. Без защищённого туннеля Meta не может обратиться к localhost.</p>}
            <p className="font-medium">Маркер подтверждения</p>
            <p>{p.verifyTokenConfigured ? "Точное значение INSTAGRAM_WEBHOOK_VERIFY_TOKEN из переменных окружения сервера (здесь не показывается)." : <span className="text-amber-700">INSTAGRAM_WEBHOOK_VERIFY_TOKEN не задан — подтверждение не пройдёт.</span>}</p>
            <p className="text-muted-foreground">Затем подпишитесь на поле <code>messages</code>. Эта страница не видит, подтвердила ли Meta адрес; доставку подтвердит строка «Последнее событие», когда придут сообщения.</p>
          </div>
        </details>
      </CardContent>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отключить @{c?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              Сохранённый токен доступа будет удалён, и новые сообщения из Instagram перестанут поступать. Существующие диалоги останутся во входящих.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                start(async () => {
                  const res = await disconnectInstagramAction(p.slug);
                  if (res.ok) toast.success(res.message);
                  else toast.error(res.error);
                })
              }
            >
              Отключить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
