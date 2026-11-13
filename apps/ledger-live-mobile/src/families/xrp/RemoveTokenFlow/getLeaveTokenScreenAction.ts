import { StackActions, type NavigationState, type PartialState } from "@react-navigation/native";
import { ScreenName } from "~/const";
import { isAccountRoute } from "~/screens/Account/isAccountRoute";

type AnyState = NavigationState | PartialState<NavigationState>;

function findAccountScreen(state: AnyState, accountId: string): [AnyState, number] | undefined {
  const index = state.routes.findIndex(route => isAccountRoute(route, accountId));
  if (index !== -1) return [state, index];

  for (const route of state.routes) {
    const found = route.state && findAccountScreen(route.state, accountId);
    if (found) return found;
  }

  return undefined;
}

/**
 * Takes the token screen under the flow to its parent account right away, rather than once a sync
 * drops the token account: back when the parent screen is right below, else in its place.
 * Reads the root state: a parent navigator's copy of a child's state can lack its keys.
 */
export function getLeaveTokenScreenAction(
  rootState: NavigationState,
  tokenAccountId: string,
  parentId: string,
) {
  const found = findAccountScreen(rootState, tokenAccountId);
  if (!found) return undefined;

  const [stack, index] = found;
  const tokenRouteKey = stack.routes[index].key;
  if (!stack.key || !tokenRouteKey) return undefined;

  const leave = isAccountRoute(stack.routes[index - 1], parentId)
    ? StackActions.pop()
    : StackActions.replace(ScreenName.Account, { accountId: parentId });

  return { ...leave, source: tokenRouteKey, target: stack.key };
}
