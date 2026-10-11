import { COMPANY } from "@/lib/company";

/** Support address: SUPPORT_EMAIL if set in the environment, otherwise the public company email. */
export function SupportContact() {
  const email = process.env.SUPPORT_EMAIL?.trim() || COMPANY.email;
  return (
    <a href={`mailto:${email}`} className="font-medium text-primary hover:underline">
      {email}
    </a>
  );
}
