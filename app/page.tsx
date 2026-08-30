import { redirect } from "next/navigation";

export const dynamic = "force-static";

// This deployment is a headless data service for The Desk. The product lives in
// the Roster app. Anyone hitting the root gets sent there.
export default function Page() {
  redirect("https://therostercollective.com/desk");
}
