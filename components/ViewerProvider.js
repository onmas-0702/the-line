"use client";

// 지금 화면을 보는 사람(Viewer)을 하위 컴포넌트에 나눠줍니다. 권한 판단은 항상
// AccessPolicy(lib/access.js)에 Viewer를 넘겨서 합니다.
//
// Viewer는 서버(app/layout.js → ServerViewer.current())가 로그인 세션으로 만들어 평범한
// 객체로 넘겨주고, 여기서 Viewer 인스턴스로 되살립니다. 다른 탭에서 로그인·로그아웃하는 등
// 세션이 바뀌면 router.refresh()로 서버가 Viewer를 다시 만들게 합니다.

import { createContext, useContext, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Viewer } from "@/lib/access";
import { supabase } from "@/lib/supabaseClient";

const ViewerContext = createContext(Viewer.guest());

export default function ViewerProvider({ viewer: viewerData, children }) {
  const router = useRouter();
  const viewer = useMemo(() => Viewer.fromJSON(viewerData), [viewerData]);

  useEffect(() => {
    if (!supabase || viewer.isPreviewAdmin) return undefined;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const changedUser = (session?.user?.id || null) !== viewer.userId;
      if ((event === "SIGNED_IN" || event === "SIGNED_OUT") && changedUser) router.refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [router, viewer.userId, viewer.isPreviewAdmin]);

  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer() {
  return useContext(ViewerContext);
}
