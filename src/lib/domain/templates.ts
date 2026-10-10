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
    name: "Lead magnet: free guide",
    description: "Send a free guide when someone comments or messages GUIDE, and capture their email.",
    category: "lead_generation",
    build() {
      const g = new GraphBuilder();
      const t = g.trigger({ kind: "keyword", keywords: ["guide", "free"], sampleInput: "Can I get the free GUIDE?" }, { label: "Keyword: GUIDE" });
      const ask = g.message("Hey {{contact.first_name}}! 🎁 I'd love to send you the free guide. What's the best email to send it to?", {
        waitForReply: true,
        saveReplyAs: "email_reply",
      });
      const capture = g.action({ kind: "capture", target: "email", source: "variable", variable: "email_reply" }, { label: "Capture email" });
      const got = g.condition([{ kind: "contact_field", field: "email", operator: "is_not_empty", value: "" }], "all", { label: "Email captured?" });
      const tag = g.action({ kind: "add_tag", tag: "lead-magnet" });
      const send = g.message("Done! ✅ The guide is on its way to {{contact.email}}. You can also grab it here:", {
        linkButtons: [{ id: "b1", label: "Download the guide", url: "https://example.com/guide" }],
      });
      const endOk = g.end("goal_reached", "Lead captured");
      const retry = g.message("Hmm, that doesn't look like an email address. No worries — here's the direct link instead:", {
        linkButtons: [{ id: "b1", label: "Download the guide", url: "https://example.com/guide" }],
      });
      const endNo = g.end("completed", "No email");
      g.chain(t, ask, capture, got).connect(got, tag, "true").chain(tag, send, endOk).connect(got, retry, "false").chain(retry, endNo);
      return g.build();
    },
  },
  {
    slug: "faq-auto-answers",
    name: "FAQ auto-answers",
    description: "Answer common questions about shipping, returns and opening hours; route everything else to a human.",
    category: "faq_support",
    build() {
      const g = new GraphBuilder();
      const t = g.trigger({ kind: "incoming_message", sampleInput: "How long does shipping take?" }, { label: "Any incoming message" });
      const isShipping = g.condition([{ kind: "message_contains", keywords: ["shipping", "delivery", "deliver"], caseSensitive: false }], "any", { label: "About shipping?" });
      const shipping = g.message("📦 We ship within 1–2 business days. Delivery usually takes 3–5 days after that.");
      const endShip = g.end("completed", "Shipping answered");
      const isReturns = g.condition([{ kind: "message_contains", keywords: ["return", "refund", "exchange"], caseSensitive: false }], "any", { label: "About returns?" });
      const returns = g.message("↩️ You can return any item within 30 days for a full refund. Reply HELP if you need a return label.");
      const endRet = g.end("completed", "Returns answered");
      const handoff = g.message("Thanks for your message! A member of our team will get back to you shortly. 🙌");
      const flag = g.action({ kind: "add_tag", tag: "needs-reply" });
      const endHandoff = g.end("handoff", "Human follow-up");
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
    name: "Product finder quiz",
    description: "Ask one question and recommend the right product based on the answer.",
    category: "product_recommendations",
    build() {
      const g = new GraphBuilder();
      const t = g.trigger({ kind: "keyword", keywords: ["recommend", "quiz", "help"], sampleInput: "Can you recommend something?" }, { label: "Keyword: RECOMMEND" });
      const ask = g.message("Happy to help! What's your skin type?", {
        quickReplies: [
          { id: "q1", label: "Dry" },
          { id: "q2", label: "Oily" },
          { id: "q3", label: "Combination" },
        ],
        waitForReply: true,
        saveReplyAs: "skin_type",
      });
      const save = g.action({ kind: "set_field", field: "skin_type", value: "{{skin_type}}" });
      const isDry = g.condition([{ kind: "variable", variable: "skin_type", operator: "contains", value: "dry" }], "all", { label: "Dry skin?" });
      const dry = g.message("For dry skin we recommend our Hydra Cream 💧", { linkButtons: [{ id: "b1", label: "View Hydra Cream", url: "https://example.com/hydra" }] });
      const other = g.message("Our Balance Gel is perfect for you ✨", { linkButtons: [{ id: "b1", label: "View Balance Gel", url: "https://example.com/balance" }] });
      const end1 = g.end("goal_reached", "Recommended");
      const end2 = g.end("goal_reached", "Recommended");
      g.chain(t, ask, save, isDry).connect(isDry, dry, "true").chain(dry, end1).connect(isDry, other, "false").chain(other, end2);
      return g.build();
    },
  },
  {
    slug: "course-sales",
    name: "Course sales: beginner or advanced",
    description: "When someone sends COURSE, ask their level, send the right course link and save their interest.",
    category: "course_sales",
    build() {
      const g = new GraphBuilder();
      const t = g.trigger({ kind: "keyword", keywords: ["course"], sampleInput: "COURSE" }, { label: "Keyword: COURSE" });
      const ask = g.message("Great to see you, {{contact.first_name}}! 🎓 Which course are you interested in?", {
        quickReplies: [
          { id: "q1", label: "Beginner" },
          { id: "q2", label: "Advanced" },
        ],
        waitForReply: true,
        saveReplyAs: "course_choice",
      });
      const isBeginner = g.condition([{ kind: "variable", variable: "course_choice", operator: "contains", value: "beginner" }], "all", { label: "Beginner?" });
      const setB = g.action({ kind: "set_field", field: "course_interest", value: "beginner" });
      const sendB = g.message("Here's the Beginner course — perfect to get started 🚀", { linkButtons: [{ id: "b1", label: "Beginner course", url: "https://example.com/courses/beginner" }] });
      const setA = g.action({ kind: "set_field", field: "course_interest", value: "advanced" });
      const sendA = g.message("Here's the Advanced course — let's level up 🔥", { linkButtons: [{ id: "b1", label: "Advanced course", url: "https://example.com/courses/advanced" }] });
      const tag = g.action({ kind: "add_tag", tag: "course-lead" });
      const tag2 = g.action({ kind: "add_tag", tag: "course-lead" });
      const endB = g.end("goal_reached", "Link sent");
      const endA = g.end("goal_reached", "Link sent");
      g.chain(t, ask, isBeginner);
      g.connect(isBeginner, setB, "true").chain(setB, sendB, tag, endB);
      g.connect(isBeginner, setA, "false").chain(setA, sendA, tag2, endA);
      return g.build();
    },
  },
  {
    slug: "booking-inquiry",
    name: "Booking inquiry",
    description: "Collect the preferred date and phone number for a booking request and flag it for the team.",
    category: "booking",
    build() {
      const g = new GraphBuilder();
      const t = g.trigger({ kind: "phrase", phrases: ["book", "appointment", "reservation"], phraseMatch: "contains", sampleInput: "I'd like to book an appointment" }, { label: "Booking request" });
      const askDate = g.message("I'd be happy to help you book! 📅 Which day works best for you?", { waitForReply: true, saveReplyAs: "preferred_date" });
      const saveDate = g.action({ kind: "set_field", field: "preferred_date", value: "{{preferred_date}}" });
      const askPhone = g.message("Got it! What's the best phone number to confirm your booking?", { waitForReply: true, saveReplyAs: "phone_reply" });
      const capture = g.action({ kind: "capture", target: "phone", source: "variable", variable: "phone_reply" });
      const tag = g.action({ kind: "add_tag", tag: "booking-request" });
      const log = g.action({ kind: "log_event", eventName: "booking_requested", note: "Preferred date: {{preferred_date}}" });
      const confirm = g.message("Thanks! We've noted {{preferred_date}} and will confirm shortly. ✅");
      const end = g.end("goal_reached", "Booking requested");
      g.chain(t, askDate, saveDate, askPhone, capture, tag, log, confirm, end);
      return g.build();
    },
  },
  {
    slug: "welcome-sequence",
    name: "Welcome sequence",
    description: "Greet new contacts, introduce your brand and follow up a day later.",
    category: "welcome",
    build() {
      const g = new GraphBuilder();
      const t = g.trigger({ kind: "incoming_message", sampleInput: "Hi!" }, { label: "First message" });
      const isNew = g.condition([{ kind: "has_tag", tag: "welcomed" }], "all", { label: "Already welcomed?" });
      const hi = g.message(["Welcome, {{contact.first_name}}! 👋", "We share tips, behind-the-scenes and exclusive offers here."]);
      const tag = g.action({ kind: "add_tag", tag: "welcomed" });
      const wait = g.action({ kind: "wait", seconds: 86400 }, { label: "Wait 1 day" });
      const follow = g.message("Quick tip for day one: reply MENU anytime to see everything we can help with. 💡");
      const end = g.end("completed", "Welcomed");
      const endSkip = g.end("completed", "Already welcomed");
      g.chain(t, isNew).connect(isNew, endSkip, "true").connect(isNew, hi, "false").chain(hi, tag, wait, follow, end);
      return g.build();
    },
  },
  {
    slug: "lead-qualification",
    name: "Lead qualification",
    description: "Ask about budget and timeline, then mark serious leads as qualified.",
    category: "lead_qualification",
    build() {
      const g = new GraphBuilder();
      const t = g.trigger({ kind: "keyword", keywords: ["price", "pricing", "quote"], sampleInput: "What's your pricing?" }, { label: "Keyword: PRICE" });
      const askBudget = g.message("Happy to share pricing! First, what budget do you have in mind?", {
        quickReplies: [
          { id: "q1", label: "Under $500" },
          { id: "q2", label: "$500–2,000" },
          { id: "q3", label: "$2,000+" },
        ],
        waitForReply: true,
        saveReplyAs: "budget",
      });
      const saveBudget = g.action({ kind: "set_field", field: "budget", value: "{{budget}}" });
      const askWhen = g.message("And when would you like to start?", {
        quickReplies: [
          { id: "q1", label: "This month" },
          { id: "q2", label: "Later" },
        ],
        waitForReply: true,
        saveReplyAs: "timeline",
      });
      const isHot = g.condition([{ kind: "variable", variable: "timeline", operator: "contains", value: "month" }], "all", { label: "Starting soon?" });
      const qualify = g.action({ kind: "mark_qualified" });
      const hot = g.message("Perfect — you're a great fit! 🙌 Someone from our team will reach out today with a tailored quote.");
      const endHot = g.end("goal_reached", "Qualified");
      const nurture = g.action({ kind: "add_tag", tag: "nurture" });
      const cold = g.message("Thanks! Here's our pricing overview so you can plan ahead:", { linkButtons: [{ id: "b1", label: "See pricing", url: "https://example.com/pricing" }] });
      const endCold = g.end("completed", "Nurture");
      g.chain(t, askBudget, saveBudget, askWhen, isHot);
      g.connect(isHot, qualify, "true").chain(qualify, hot, endHot);
      g.connect(isHot, nurture, "false").chain(nurture, cold, endCold);
      return g.build();
    },
  },
  {
    slug: "follow-up-sequence",
    name: "Follow-up sequence",
    description: "Check back in with a contact after an inquiry, with a second nudge if they don't answer.",
    category: "follow_up",
    build() {
      const g = new GraphBuilder();
      const t = g.trigger({ kind: "webhook", eventName: "inquiry_received", sampleInput: "Inquiry received" }, { label: "Event: inquiry_received" });
      const wait1 = g.action({ kind: "wait", seconds: 3600 }, { label: "Wait 1 hour" });
      const nudge = g.message("Hi {{contact.first_name}}, just checking in — did you get everything you needed? 😊", {
        quickReplies: [
          { id: "q1", label: "Yes, thanks!" },
          { id: "q2", label: "I have a question" },
        ],
        waitForReply: true,
        saveReplyAs: "follow_up_answer",
        replyTimeoutSeconds: 86400,
      });
      const replied = g.condition([{ kind: "variable", variable: "follow_up_answer", operator: "is_not_empty", value: "" }], "all", { label: "Replied?" });
      const thanks = g.message("Great, thanks for letting us know! 🙏");
      const endReplied = g.end("completed", "Replied");
      const last = g.message("No worries if you're busy! Reply anytime and we'll be right here. 👋");
      const tag = g.action({ kind: "add_tag", tag: "no-response" });
      const endSilent = g.end("completed", "No response");
      g.chain(t, wait1, nudge, replied);
      g.connect(replied, thanks, "true").chain(thanks, endReplied);
      g.connect(replied, last, "false").chain(last, tag, endSilent);
      return g.build();
    },
  },
];
