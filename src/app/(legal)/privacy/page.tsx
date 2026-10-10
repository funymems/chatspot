import type { Metadata } from "next";
import Link from "next/link";
import { SupportContact } from "@/components/brand/support-contact";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="text-muted-foreground">Last updated: October 10, 2026</p>

      <p>
        ChatSpot (“we”, “the service”) helps businesses and creators automate conversations, manage contacts and answer customer messages. This
        policy explains what data we process, why, and how you can control it.
      </p>

      <h2>Who this policy applies to</h2>
      <ul>
        <li>
          <strong>Account holders</strong> — people who sign up to ChatSpot and manage a workspace.
        </li>
        <li>
          <strong>End users</strong> — people who send messages to a business that uses ChatSpot (for example via Instagram Direct). The business
          is the controller of that data; ChatSpot processes it on the business’s behalf.
        </li>
      </ul>

      <h2>Data we collect</h2>
      <ul>
        <li>Account data: name, email address and a hashed password.</li>
        <li>Workspace content you create: automations, AI agent settings, knowledge-base documents, templates, notes.</li>
        <li>
          Contacts and conversations: names, contact details and custom fields you enter or that automations collect, and the messages exchanged
          in connected channels.
        </li>
        <li>
          Instagram data, when a business connects an Instagram professional account through Meta’s official Instagram API: the account’s ID and
          username, granted permissions, an access token, and Direct messages and related events sent to that account (sender’s Instagram-scoped
          ID, message text and attachment metadata).
        </li>
        <li>Technical logs: timestamps, error information and event identifiers needed to operate and secure the service. Logs do not contain access tokens or message text.</li>
      </ul>

      <h2>How we use data</h2>
      <ul>
        <li>To provide the service: show conversations in the inbox, run the automations a business configures, and keep contact records.</li>
        <li>To generate AI replies when a business enables an AI agent. Message content and the business’s knowledge base are sent to the configured AI provider (Google Gemini) only to produce that reply.</li>
        <li>To secure the service, prevent abuse and fix problems.</li>
      </ul>
      <p>We do not sell personal data and do not use Instagram data for advertising.</p>

      <h2>Instagram data and Meta Platform Terms</h2>
      <p>
        Instagram data is accessed only with the permissions the business grants (currently profile access and messaging) and only to provide the
        features above. Access tokens are encrypted at rest and never exposed to browsers. A business can disconnect Instagram at any time in
        Settings, which deletes the stored token; access can also be removed in Instagram under Settings → Apps and websites.
      </p>

      <h2>Sharing</h2>
      <ul>
        <li>Infrastructure providers that host the service and database (e.g. Vercel, Supabase), bound by data-processing terms.</li>
        <li>The AI provider (Google) when AI replies are enabled.</li>
        <li>Meta, when sending or receiving messages through Instagram on a business’s behalf.</li>
        <li>Authorities, if required by law.</li>
      </ul>

      <h2>Retention</h2>
      <p>
        Data is kept while the workspace exists. Deleting a contact, conversation or workspace removes the related data from our database;
        disconnecting Instagram deletes its access token immediately. Backups expire on the provider’s standard schedule.
      </p>

      <h2>Your rights</h2>
      <p>
        You can access, correct, export or delete your data. End users who messaged a business should contact that business first; you can also
        contact us and we will forward or fulfil the request. See <Link href="/data-deletion" className="text-primary hover:underline">Data deletion</Link>.
      </p>

      <h2>Security</h2>
      <p>Passwords are hashed, access tokens are encrypted, connections use HTTPS, and every request is checked against workspace membership.</p>

      <h2>Contact</h2>
      <p>
        Questions about privacy: <SupportContact />.
      </p>
    </>
  );
}
