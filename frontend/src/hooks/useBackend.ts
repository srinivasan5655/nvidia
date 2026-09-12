import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function useRuntimeConfig() {
  return useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: 30_000 });
}

export function useRelayStatus(enabled: boolean) {
  return useQuery({
    queryKey: ["relay-status"],
    queryFn: api.relayStatus,
    enabled,
    refetchInterval: enabled ? 5000 : false,
  });
}

export function useRelayTrace(enabled: boolean) {
  return useQuery({
    queryKey: ["relay-trace"],
    queryFn: () => api.relayTrace(200),
    enabled,
  });
}

export function useEventsList(refreshKey: number) {
  return useQuery({
    queryKey: ["events-list", refreshKey],
    queryFn: api.listEvents,
  });
}
