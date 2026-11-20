// 고객지원(/support) — 문의 방법과 자주 묻는 질문. 앱스토어·구글 플레이에 등록할 "지원 URL"이기도 합니다.
//   SupportContact — 문의 창구(이메일·전화)와 답변 안내
//   SupportFaq     — 질문 묶음(주제별). 문구는 여기서만 고칩니다.

import { PLATFORM_INFO } from "@/lib/mockData";

export class SupportContact {
  static PATH = "/support";
  static RESPONSE_TIME = "평일 기준 하루 안에 답변드려요. 주말·공휴일에 보낸 문의는 다음 평일에 답변해요.";

  static get email() {
    return PLATFORM_INFO.email;
  }

  static get phone() {
    return PLATFORM_INFO.phone;
  }

  /** 메일 앱을 열 때 제목을 미리 채웁니다. */
  static mailto(subject = "[더 라인] 문의") {
    return `mailto:${SupportContact.email}?subject=${encodeURIComponent(subject)}`;
  }
}

export class SupportFaq {
  constructor({ id, topic, items }) {
    this.id = id;
    this.topic = topic;
    this.items = Object.freeze(items.map((item) => Object.freeze({ ...item })));
    Object.freeze(this);
  }

  static ALL = Object.freeze([
    new SupportFaq({
      id: "account",
      topic: "회원가입·로그인",
      items: [
        {
          q: "회원가입은 꼭 해야 하나요?",
          a: "아니요. 모든 콘텐츠는 가입하지 않아도 무료로 들을 수 있어요. 댓글·좋아요를 남기려면 무료 회원가입이 필요해요.",
        },
        {
          q: "로그인이 안 돼요.",
          a: "가입할 때 쓴 방법(이메일·구글·카카오)으로 로그인해 주세요. 이메일 가입이라면 로그인 화면의 '비밀번호 찾기'로 새 비밀번호를 만들 수 있어요. 그래도 안 되면 가입한 이메일 주소와 함께 문의해 주세요.",
        },
        {
          q: "\"이용이 정지된 계정\"이라고 나와요.",
          a: "운영 정책을 어긴 계정은 이용이 정지될 수 있어요. 잘못 정지되었다고 생각되면 가입한 이메일 주소와 함께 문의해 주세요.",
        },
      ],
    }),
    new SupportFaq({
      id: "membership",
      topic: "멤버십(구독)·결제",
      items: [
        {
          q: "멤버십에 가입하면 무엇이 달라지나요?",
          a: "콘텐츠 담아두기, 감상일기, 마이 페이지의 공지 등 구독자 전용 기능을 쓸 수 있어요. 콘텐츠 듣기는 가입하지 않아도 무료예요.",
        },
        {
          q: "결제는 언제 되나요?",
          a: "월간은 가입한 날 첫 결제가 되고, 그 뒤로 한 달마다 같은 날에 자동으로 결제돼요. 연간은 가입할 때 1년 이용료를 한 번만 결제하고, 자동으로 다시 결제되지 않아요. 1년이 지나면 이용이 끝나니 계속 이용하려면 다시 가입해 주세요.",
        },
        {
          q: "해지는 어떻게 하나요?",
          a: "월간 멤버십은 마이 페이지 > 멤버십에서 언제든 해지할 수 있어요. 해지해도 이미 결제한 기간이 끝날 때까지는 계속 이용할 수 있고, 그다음 결제부터 멈춰요. 연간 멤버십은 자동으로 다시 결제되지 않아서 따로 해지할 필요가 없어요.",
        },
        {
          q: "환불받을 수 있나요?",
          a: "결제 후 7일 안에 구독자 전용 기능을 쓰지 않았다면 전액 환불받을 수 있어요. 자세한 기준은 이용약관의 환불정책을 확인해 주세요.",
          link: { href: "/terms#refund", label: "환불정책 보기" },
        },
      ],
    }),
    new SupportFaq({
      id: "community",
      topic: "댓글·신고·차단",
      items: [
        {
          q: "불쾌한 댓글을 봤어요.",
          a: "댓글 옆 ⋯ 메뉴에서 '신고하기'를 눌러 주세요. 운영진이 24시간 안에 확인해 숨기거나 삭제해요. 신고한 댓글은 내 화면에서 바로 사라져요.",
        },
        {
          q: "특정 회원의 댓글을 보고 싶지 않아요.",
          a: "댓글 옆 ⋯ 메뉴에서 '이 사람 차단하기'를 누르면 그 회원의 댓글이 보이지 않아요. 차단은 마이 페이지 > 계정에서 언제든 풀 수 있어요.",
        },
      ],
    }),
    new SupportFaq({
      id: "leave",
      topic: "회원 탈퇴·개인정보",
      items: [
        {
          q: "탈퇴는 어떻게 하나요?",
          a: "마이 페이지 > 계정 > 회원 탈퇴에서 바로 할 수 있어요. 탈퇴하면 계정과 기록이 지워지고 되돌릴 수 없어요. 멤버십을 이용 중이면 먼저 해지해 주세요.",
          link: { href: "/mypage/account", label: "계정으로 가기" },
        },
        {
          q: "내 개인정보는 어떻게 관리되나요?",
          a: "개인정보처리방침에서 수집하는 정보, 보관 기간, 파기 방법을 확인할 수 있어요.",
          link: { href: "/privacy", label: "개인정보처리방침 보기" },
        },
      ],
    }),
  ]);
}
