import type { Metadata } from 'next';

import {
  LegalPageShell,
  type LegalDocument,
} from '@/components/legal/legal-page-shell';

export const metadata: Metadata = {
  title: '이용약관 · Kikibooks',
  description: '키키북스(Kikibooks) 서비스 이용약관 — 베타.',
};

/**
 * /terms — 이용약관 (베타 placeholder).
 *
 * 본문은 베타용 일반론이며 phase-14 정식 출시 전 변호사 검토본으로 교체된다
 * (LegalPageShell 상단 배너로 명시). 카피는 단일 출처 추상화 없이 페이지 내부
 * 상수로 둔다 — 랜딩 카피와 달리 DB로 옮길 계획이 없고(phase-13b 무관) 이
 * 페이지에서만 쓰이는 placeholder이기 때문이다.
 */
const TERMS_DOCUMENT: LegalDocument = {
  title: '이용약관',
  effectiveDate: '2026년 5월 19일 (베타)',
  intro:
    '본 약관은 주식회사 위체인지(WECHANGE)가 운영하는 키키북스(Kikibooks) 서비스의 이용 조건을 정합니다. 키키북스는 현재 베타 운영 중이며, 본 약관은 정식 출시 전 변경될 수 있습니다.',
  sections: [
    {
      heading: '목적',
      paragraphs: [
        '본 약관은 키키북스가 제공하는 유아 영어 그림책 서비스(이하 "서비스")의 이용과 관련하여 회사와 이용자 간의 권리·의무 및 책임 사항을 규정하는 것을 목적으로 합니다.',
      ],
    },
    {
      heading: '서비스의 이용',
      paragraphs: [
        '이용자는 회원가입을 통해 서비스를 무료로 이용할 수 있습니다. 서비스는 만 3~7세 유아를 위한 영어 그림책 열람을 제공합니다.',
        '회사는 안정적인 서비스 제공을 위해 필요한 경우 서비스의 내용을 변경하거나 중단할 수 있으며, 베타 기간 중에는 기능이 수시로 추가·변경될 수 있습니다.',
      ],
    },
    {
      heading: '콘텐츠와 저작권',
      paragraphs: [
        '서비스가 제공하는 그림책은 Creative Commons Attribution 4.0(CC BY 4.0) 등 자유 이용이 허용된 라이선스의 콘텐츠입니다. 각 도서의 저작자와 원본 출처는 해당 도서 상세 페이지에 표시됩니다.',
        '이용자는 서비스의 콘텐츠를 개인적·비상업적 열람 용도로만 이용하며, 무단 복제·배포·재판매를 하지 않습니다.',
      ],
    },
    {
      heading: '이용자의 의무',
      paragraphs: [
        '이용자는 계정 정보를 정확하게 입력하고 타인의 정보를 도용하지 않습니다.',
        '이용자는 서비스의 정상적인 운영을 방해하는 행위를 하지 않습니다.',
      ],
    },
    {
      heading: '베타 서비스 안내',
      paragraphs: [
        '키키북스는 베타 단계의 서비스로, 일부 기능이 불완전하거나 데이터가 변경될 수 있습니다. 회사는 베타 기간 중 발생한 오류에 대해 합리적인 범위에서 개선을 위해 노력합니다.',
      ],
    },
    {
      heading: '문의',
      paragraphs: [
        '본 약관 및 서비스에 관한 문의는 주식회사 위체인지(WECHANGE)로 연락해 주시기 바랍니다.',
      ],
    },
  ],
};

export default function TermsPage() {
  return <LegalPageShell doc={TERMS_DOCUMENT} />;
}
