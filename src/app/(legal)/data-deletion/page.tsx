import type { Metadata } from "next";
import { SupportContact } from "@/components/brand/support-contact";

export const metadata: Metadata = { title: "Data Deletion" };

export default function DataDeletionPage() {
  return (
    <>
      <h1>Data Deletion Instructions</h1>
      <p>You can remove your data from ChatSpot at any time.</p>

      <h2>If you connected an Instagram account</h2>
      <ul>
        <li>
          In ChatSpot, open <strong>Settings → Instagram → Disconnect</strong>. The stored access token is deleted immediately and no new messages
          are received.
        </li>
        <li>
          Optionally remove the app in Instagram: <strong>Settings → Apps and websites → Active</strong> → select the app → <strong>Remove</strong>.
        </li>
        <li>To delete conversations and contacts that came from Instagram, delete them in ChatSpot (Contacts → contact → Delete contact) or ask us to delete them for you.</li>
      </ul>

      <h2>If you messaged a business that uses ChatSpot</h2>
      <p>
        Ask that business to delete your conversation, or email us with the Instagram username you used and the business you contacted, and we
        will delete the related contact and messages.
      </p>

      <h2>Delete your ChatSpot account</h2>
      <p>
        Email us from the address you signed up with and we will delete your account and all workspaces you own within 30 days.
      </p>

      <h2>Contact</h2>
      <p>
        <SupportContact />
      </p>
    </>
  );
}
