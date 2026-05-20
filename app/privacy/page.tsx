import type { Metadata } from 'next';

import {
  LegalPageShell,
  type LegalDocument,
} from '@/components/legal/legal-page-shell';

export const metadata: Metadata = {
  title: '개인정보처리방침 · Kikibooks',
  description: '키키북스(Kikibooks) 개인정보처리방침 — 베타.',
};

/**
 * /privacy — 개인정보처리방침 (베타 placeholder).
 *
 * 본문은 베타용 일반론이며 phase-14 정식 출시 전 변호사 검토본으로 교체된다.
 * 수집 항목은 현재 구현(이메일 인증·자녀 이름/나이/레벨)에 맞춰 사실대로 기재한다.
 */
const PRIVACY_DOCUMENT: LegalDocument = {
  title: '개인정보처리방침',
  effectiveDate: '2026년 5월 19일 (베타)',
  intro:
    '주식회사 위체인지(WECHANGE)는 키키북스(Kikibooks) 서비스 이용자의 개인정보를 중요하게 생각하며 관련 법령을 준수합니다. 본 방침은 베타 운영 기준이며 정식 출시 전 변경될 수 있습니다.',
  sections: [
    {
      heading: '수집하는 개인정보 항목',
      paragraphs: [
        '회원가입·로그인: 이메일 주소. Google 계정으로 로그인하는 경우 Google이 제공하는 기본 프로필 정보.',
        '자녀 프로필: 자녀의 이름(또는 애칭)과 나이. 아이에게 맞는 그림책을 추천하기 위한 최소한의 정보이며, 생일·성별 등은 수집하지 않습니다.',
      ],
    },
    {
      heading: '개인정보의 이용 목적',
      paragraphs: [
        '수집한 정보는 회원 식별과 로그인, 자녀 나이에 맞는 그림책 추천, 읽기 기록 제공의 목적으로만 이용합니다.',
        '키키북스는 광고를 게재하지 않으며, 개인정보를 마케팅 목적으로 이용하지 않습니다.',
      ],
    },
    {
      heading: '개인정보의 보유 및 이용 기간',
      paragraphs: [
        '개인정보는 회원 탈퇴 시까지 보유하며, 탈퇴 시 지체 없이 파기합니다. 다만 관련 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.',
      ],
    },
    {
      heading: '개인정보의 처리 위탁',
      paragraphs: [
        '키키북스는 안정적인 서비스 운영을 위해 데이터베이스·인증 인프라를 외부 클라우드 서비스(Supabase)에 위탁하여 처리하며, 데이터는 보안이 적용된 환경에 저장됩니다.',
        '키키북스는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다.',
      ],
    },
    {
      heading: '이용자의 권리',
      paragraphs: [
        '이용자는 언제든지 자신과 자녀의 개인정보를 조회·수정하거나, 회원 탈퇴를 통해 삭제를 요청할 수 있습니다.',
      ],
    },
    {
      heading: '문의',
      paragraphs: [
        '개인정보 처리에 관한 문의는 주식회사 위체인지(WECHANGE)로 연락해 주시기 바랍니다.',
      ],
    },
  ],
};

export default function PrivacyPage() {
  return <LegalPageShell doc={PRIVACY_DOCUMENT} />;
}
