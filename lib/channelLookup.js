// 서버 전용 — URL의 채널 주소 → Channel. 채널 레이아웃·스튜디오 레이아웃·generateMetadata가
// 같은 요청에서 채널을 여러 번 조회하지 않도록 React cache로 묶습니다.

import { cache } from "react";
import { ChannelResolver } from "@/lib/channel";
import { SITE_NAME } from "@/lib/mockData";

export const resolveChannel = cache((slug) => new ChannelResolver({ defaultName: SITE_NAME }).resolve(slug));
