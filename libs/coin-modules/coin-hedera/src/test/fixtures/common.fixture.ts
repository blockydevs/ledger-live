import type network from "@ledgerhq/live-network/network";

export const getMockResponse = (data: any): Awaited<ReturnType<typeof network>> => ({
  data,
  status: 200,
  statusText: "OK",
  headers: {},
  config: {
    headers: {} as any,
  },
});
