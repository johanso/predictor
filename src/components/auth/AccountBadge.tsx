import { getAccount } from "@/lib/auth/server";
import { LogoutButton } from "@/components/auth/LogoutButton";

/**
 * Which bookmaker account the numbers on screen belong to. It stacks above the
 * two quota badges: same corner, same reason — persistent status that has to be
 * true on every page, not just the bets one.
 */
export async function AccountBadge() {
  const account = await getAccount();
  if (!account) return null;

  return (
    <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end gap-0.5 border border-line bg-paper-raised px-3 py-1.5 text-xs shadow-sm print:hidden">
      <span className="label-eyebrow text-ink">{account.name}</span>
      <LogoutButton />
    </div>
  );
}
