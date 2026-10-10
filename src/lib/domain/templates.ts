import { GraphBuilder } from "./graph/builder";
import type { AutomationGraph } from "./graph/schema";
import type { TemplateCategory } from "./template-categories";
export { templateCategories, type TemplateCategory } from "./template-categories";

export type TemplateDefinition = {
  slug: string;
  name: string;
  description: string;
  category: TemplateCategory;
  build: () => AutomationGraph;
};

/**
 * Built-in templates. Each is a complete, valid graph (verified in tests) and
 * contains no workspace-specific references, so it can be copied anywhere.
 */
export const builtInTemplates: TemplateDefinition[] = [
  {
    slug: "lead-magnet",
    name: "Лид-магнит: бесплатный гайд",
    description: "Отправляет бесплатный гайд, когда человек пишет слово ГАЙД, и сохраняет его эл. почту.",
    category: "lead_generation",
    build() {
      const g = new GraphBuilder();
      const t = g.trigger({ kind: "keyword", keywords: ["гайд", "бесплатно", "guide"], sampleInput: "Можно бесплатный ГАЙД?" }, { label: "Ключевое слово: ГАЙД" });
      const ask = g.message("Привет, {{contact.first_name}}! 🎁 С радостью пришлю бесплатный гайд. На какую почту его отправить?", {
        waitForReply: true,
        saveReplyAs: "email_reply",
      });
      const capture = g.action({ kind: "capture", target: "email", source: "variable", variable: "email_reply" }, { label: "Сохранить эл. почту" });
      const got = g.condition([{ kind: "contact_field", field: "email", operator: "is_not_empty", value: "" }], "all", { label: "Почта получена?" });
      const tag = g.action({ kind: "add_tag", tag: "лид-магнит" });
      const send = g.message("Готово! ✅ Гайд уже летит на {{contact.email}}. А ещё его можно скачать здесь:", {
        linkButtons: [{ id: "b1", label: "Скачать гайд", url: "https://example.com/guide" }],
      });
      const endOk = g.end("goal_reached", "Лид получен");
      const retry = g.message("Хм, это не похоже на адрес эл. почты. Ничего страшного — вот прямая ссылка:", {
        linkButtons: [{ id: "b1", label: "Скачать гайд", url: "https://example.com/guide" }],
      });
      const endNo = g.end("completed", "Без почты");
      g.chain(t, ask, capture, got).connect(got, tag, "true").chain(tag, send, endOk).connect(got, retry, "false").chain(retry, endNo);
      return g.build();
    },
  },
  {
    slug: "faq-auto-answers",
    name: "Автоответы на частые вопросы",
    description: "Отвечает на частые вопросы о доставке и возврате, а всё остальное передаёт человеку.",
    category: "faq_support",
    build() {
      const g = new GraphBuilder();
      const t = g.trigger({ kind: "incoming_message", sampleInput: "Сколько идёт доставка?" }, { label: "Любое входящее сообщение" });
      const isShipping = g.condition([{ kind: "message_contains", keywords: ["доставка", "доставку", "доставки", "доставите"], caseSensitive: false }], "any", { label: "Про доставку?" });
      const shipping = g.message("📦 Мы отправляем заказы в течение 1–2 рабочих дней. Доставка обычно занимает ещё 3–5 дней.");
      const endShip = g.end("completed", "Ответ про доставку");
      const isReturns = g.condition([{ kind: "message_contains", keywords: ["возврат", "вернуть", "обмен", "обменять"], caseSensitive: false }], "any", { label: "Про возврат?" });
      const returns = g.message("↩️ Любой товар можно вернуть в течение 30 дней с полным возвратом денег. Напишите ПОМОЩЬ, если нужна накладная для возврата.");
      const endRet = g.end("completed", "Ответ про возврат");
      const handoff = g.message("Спасибо за сообщение! Сотрудник нашей команды скоро вам ответит. 🙌");
      const flag = g.action({ kind: "add_tag", tag: "нужен-ответ" });
      const endHandoff = g.end("handoff", "Ответит человек");
      g.chain(t, isShipping);
      g.connect(isShipping, shipping, "true").chain(shipping, endShip);
      g.connect(isShipping, isReturns, "false");
      g.connect(isReturns, returns, "true").chain(returns, endRet);
      g.connect(isReturns, handoff, "false").chain(handoff, flag, endHandoff);
      return g.build();
    },
  },
  {
    slug: "product-finder",
    name: "Квиз: подбор товара",
    description: "Задаёт один вопрос и советует подходящий товар по ответу.",
    category: "product_recommendations",
    build() {
      const g = new GraphBuilder();
      const t = g.trigger({ kind: "keyword", keywords: ["подобрать", "посоветуйте", "квиз"], sampleInput: "Посоветуйте что-нибудь" }, { label: "Ключевое слово: ПОДОБРАТЬ" });
      const ask = g.message("С радостью помогу! Какой у вас тип кожи?", {
        quickReplies: [
          { id: "q1", label: "Сухая" },
          { id: "q2", label: "Жирная" },
          { id: "q3", label: "Комбинированная" },
        ],
        waitForReply: true,
        saveReplyAs: "skin_type",
      });
      const save = g.action({ kind: "set_field", field: "skin_type", value: "{{skin_type}}" });
      const isDry = g.condition([{ kind: "variable", variable: "skin_type", operator: "contains", value: "сух" }], "all", { label: "Сухая кожа?" });
      const dry = g.message("Для сухой кожи советуем наш увлажняющий крем Hydra 💧", { linkButtons: [{ id: "b1", label: "Смотреть Hydra", url: "https://example.com/hydra" }] });
      const other = g.message("Вам идеально подойдёт наш гель Balance ✨", { linkButtons: [{ id: "b1", label: "Смотреть Balance", url: "https://example.com/balance" }] });
      const end1 = g.end("goal_reached", "Товар предложен");
      const end2 = g.end("goal_reached", "Товар предложен");
      g.chain(t, ask, save, isDry).connect(isDry, dry, "true").chain(dry, end1).connect(isDry, other, "false").chain(other, end2);
      return g.build();
    },
  },
  {
    slug: "course-sales",
    name: "Продажа курса: для начинающих или продвинутый",
    description: "Когда человек пишет КУРС, спрашивает уровень, отправляет ссылку на нужный курс и сохраняет интерес.",
    category: "course_sales",
    build() {
      const g = new GraphBuilder();
      const t = g.trigger({ kind: "keyword", keywords: ["курс", "course"], sampleInput: "КУРС" }, { label: "Ключевое слово: КУРС" });
      const ask = g.message("Рады вас видеть, {{contact.first_name}}! 🎓 Какой курс вас интересует?", {
        quickReplies: [
          { id: "q1", label: "Для начинающих" },
          { id: "q2", label: "Продвинутый" },
        ],
        waitForReply: true,
        saveReplyAs: "course_choice",
      });
      const isBeginner = g.condition([{ kind: "variable", variable: "course_choice", operator: "contains", value: "начина" }], "all", { label: "Для начинающих?" });
      const setB = g.action({ kind: "set_field", field: "course_interest", value: "для начинающих" });
      const sendB = g.message("Вот курс для начинающих — отличный старт 🚀", { linkButtons: [{ id: "b1", label: "Курс для начинающих", url: "https://example.com/courses/beginner" }] });
      const setA = g.action({ kind: "set_field", field: "course_interest", value: "продвинутый" });
      const sendA = g.message("Вот продвинутый курс — пора выходить на новый уровень 🔥", { linkButtons: [{ id: "b1", label: "Продвинутый курс", url: "https://example.com/courses/advanced" }] });
      const tag = g.action({ kind: "add_tag", tag: "лид-курс" });
      const tag2 = g.action({ kind: "add_tag", tag: "лид-курс" });
      const endB = g.end("goal_reached", "Ссылка отправлена");
      const endA = g.end("goal_reached", "Ссылка отправлена");
      g.chain(t, ask, isBeginner);
      g.connect(isBeginner, setB, "true").chain(setB, sendB, tag, endB);
      g.connect(isBeginner, setA, "false").chain(setA, sendA, tag2, endA);
      return g.build();
    },
  },
  {
    slug: "booking-inquiry",
    name: "Запись на услугу",
    description: "Узнаёт удобную дату и номер телефона для записи и отмечает заявку для команды.",
    category: "booking",
    build() {
      const g = new GraphBuilder();
      const t = g.trigger({ kind: "phrase", phrases: ["запис", "бронь", "забронировать"], phraseMatch: "contains", sampleInput: "Хочу записаться на приём" }, { label: "Запрос на запись" });
      const askDate = g.message("С радостью запишу вас! 📅 Какой день вам удобен?", { waitForReply: true, saveReplyAs: "preferred_date" });
      const saveDate = g.action({ kind: "set_field", field: "preferred_date", value: "{{preferred_date}}" });
      const askPhone = g.message("Понял! По какому номеру телефона подтвердить запись?", { waitForReply: true, saveReplyAs: "phone_reply" });
      const capture = g.action({ kind: "capture", target: "phone", source: "variable", variable: "phone_reply" });
      const tag = g.action({ kind: "add_tag", tag: "заявка-на-запись" });
      const log = g.action({ kind: "log_event", eventName: "booking_requested", note: "Удобная дата: {{preferred_date}}" });
      const confirm = g.message("Спасибо! Мы записали дату {{preferred_date}} и скоро подтвердим. ✅");
      const end = g.end("goal_reached", "Заявка на запись");
      g.chain(t, askDate, saveDate, askPhone, capture, tag, log, confirm, end);
      return g.build();
    },
  },
  {
    slug: "welcome-sequence",
    name: "Приветственная цепочка",
    description: "Приветствует новых контактов, рассказывает о бренде и пишет снова через день.",
    category: "welcome",
    build() {
      const g = new GraphBuilder();
      const t = g.trigger({ kind: "incoming_message", sampleInput: "Привет!" }, { label: "Первое сообщение" });
      const isNew = g.condition([{ kind: "has_tag", tag: "поприветствован" }], "all", { label: "Уже приветствовали?" });
      const hi = g.message(["Добро пожаловать, {{contact.first_name}}! 👋", "Здесь мы делимся советами, закулисьем и эксклюзивными предложениями."]);
      const tag = g.action({ kind: "add_tag", tag: "поприветствован" });
      const wait = g.action({ kind: "wait", seconds: 86400 }, { label: "Подождать 1 день" });
      const follow = g.message("Совет на первый день: напишите МЕНЮ в любой момент, чтобы увидеть, с чем мы можем помочь. 💡");
      const end = g.end("completed", "Поприветствовали");
      const endSkip = g.end("completed", "Уже приветствовали");
      g.chain(t, isNew).connect(isNew, endSkip, "true").connect(isNew, hi, "false").chain(hi, tag, wait, follow, end);
      return g.build();
    },
  },
  {
    slug: "lead-qualification",
    name: "Квалификация лидов",
    description: "Спрашивает о бюджете и сроках и отмечает горячих лидов как квалифицированных.",
    category: "lead_qualification",
    build() {
      const g = new GraphBuilder();
      const t = g.trigger({ kind: "keyword", keywords: ["цена", "стоимость", "прайс", "сколько"], sampleInput: "Какая у вас цена?" }, { label: "Ключевое слово: ЦЕНА" });
      const askBudget = g.message("С радостью расскажу о ценах! Для начала: на какой бюджет вы рассчитываете?", {
        quickReplies: [
          { id: "q1", label: "До 50 000 ₸" },
          { id: "q2", label: "50 000–200 000 ₸" },
          { id: "q3", label: "Больше 200 000 ₸" },
        ],
        waitForReply: true,
        saveReplyAs: "budget",
      });
      const saveBudget = g.action({ kind: "set_field", field: "budget", value: "{{budget}}" });
      const askWhen = g.message("А когда хотите начать?", {
        quickReplies: [
          { id: "q1", label: "В этом месяце" },
          { id: "q2", label: "Позже" },
        ],
        waitForReply: true,
        saveReplyAs: "timeline",
      });
      const isHot = g.condition([{ kind: "variable", variable: "timeline", operator: "contains", value: "месяц" }], "all", { label: "Начинает скоро?" });
      const qualify = g.action({ kind: "mark_qualified" });
      const hot = g.message("Отлично — вы нам подходите! 🙌 Сегодня с вами свяжется наш специалист с индивидуальным предложением.");
      const endHot = g.end("goal_reached", "Квалифицирован");
      const nurture = g.action({ kind: "add_tag", tag: "прогрев" });
      const cold = g.message("Спасибо! Вот обзор наших цен, чтобы вы могли спланировать заранее:", { linkButtons: [{ id: "b1", label: "Смотреть цены", url: "https://example.com/pricing" }] });
      const endCold = g.end("completed", "Прогрев");
      g.chain(t, askBudget, saveBudget, askWhen, isHot);
      g.connect(isHot, qualify, "true").chain(qualify, hot, endHot);
      g.connect(isHot, nurture, "false").chain(nurture, cold, endCold);
      return g.build();
    },
  },
  {
    slug: "follow-up-sequence",
    name: "Повторное касание",
    description: "Через некоторое время после обращения напоминает о себе и пишет ещё раз, если человек не ответил.",
    category: "follow_up",
    build() {
      const g = new GraphBuilder();
      const t = g.trigger({ kind: "webhook", eventName: "inquiry_received", sampleInput: "Получено обращение" }, { label: "Событие: inquiry_received" });
      const wait1 = g.action({ kind: "wait", seconds: 3600 }, { label: "Подождать 1 час" });
      const nudge = g.message("Здравствуйте, {{contact.first_name}}! Хотели уточнить — вы получили всё, что нужно? 😊", {
        quickReplies: [
          { id: "q1", label: "Да, спасибо!" },
          { id: "q2", label: "Есть вопрос" },
        ],
        waitForReply: true,
        saveReplyAs: "follow_up_answer",
        replyTimeoutSeconds: 86400,
      });
      const replied = g.condition([{ kind: "variable", variable: "follow_up_answer", operator: "is_not_empty", value: "" }], "all", { label: "Ответил?" });
      const thanks = g.message("Отлично, спасибо, что дали знать! 🙏");
      const endReplied = g.end("completed", "Ответил");
      const last = g.message("Ничего страшного, если вы заняты! Пишите в любое время — мы на связи. 👋");
      const tag = g.action({ kind: "add_tag", tag: "нет-ответа" });
      const endSilent = g.end("completed", "Нет ответа");
      g.chain(t, wait1, nudge, replied);
      g.connect(replied, thanks, "true").chain(thanks, endReplied);
      g.connect(replied, last, "false").chain(last, tag, endSilent);
      return g.build();
    },
  },
];
