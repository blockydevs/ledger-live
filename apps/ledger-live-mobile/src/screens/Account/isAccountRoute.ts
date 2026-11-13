import { ScreenName } from "~/const";

type Route = Readonly<{ name: string; params?: object }>;

export function isAccountRoute(route: Route | undefined, accountId: string): boolean {
  if (route?.name !== ScreenName.Account) return false;

  const { params } = route;
  if (!params || !("accountId" in params)) return false;

  return params.accountId === accountId;
}
