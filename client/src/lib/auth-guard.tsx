import { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Redirect, useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { getQueryFn } from "@/lib/queryClient";

type Me = {
  id: string;
  username?: string | null;
  role?: string | null;
  roleId?: string | null;
  isSuperAdmin?: boolean;
  permissions?: string[];
};

const CANDIDATE_ROLE_SLUG = "candidate";

export function useMe() {
  return useQuery<Me | null>({
    queryKey: ["/api/me"],
    queryFn: getQueryFn<Me | null>({ on401: "returnNull" }),
    staleTime: 60_000,
    retry: false,
  });
}

function FullPageLoader() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function isCandidate(me: Me | null | undefined): boolean {
  return !!me && me.role === CANDIDATE_ROLE_SLUG;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data: me, isLoading, isError } = useMe();
  const [loc] = useLocation();
  if (isLoading) return <FullPageLoader />;
  if (isError || !me) {
    const target = `/auth?returnTo=${encodeURIComponent(loc)}`;
    return <Redirect to={target} />;
  }
  if (isCandidate(me)) {
    return <Redirect to="/candidate-portal" />;
  }
  return <>{children}</>;
}

export function RequireCandidate({ children }: { children: ReactNode }) {
  const { data: me, isLoading, isError } = useMe();
  const [loc] = useLocation();
  if (isLoading) return <FullPageLoader />;
  if (isError || !me) {
    const target = `/auth?returnTo=${encodeURIComponent(loc)}`;
    return <Redirect to={target} />;
  }
  if (!isCandidate(me)) {
    return <Redirect to="/dashboard" />;
  }
  return <>{children}</>;
}
